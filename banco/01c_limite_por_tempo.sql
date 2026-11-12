-- Substitui o limite fixo / por equipamento (01b) por regras FÍSICAS baseadas no tempo desde a última leitura:
--   • Equipamento em HORAS: o horímetro não pode subir mais do que o tempo real que passou
--     (50 h de manhã; 10 h depois, no máximo 60 h) + tolerância de 0,5 h para diferença de relógio.
--   • Equipamento em KM: no máximo 200 km por dia desde a última leitura (mínimo 1 dia).
--   • Sem leitura anterior com data (equipamentos ainda sem histórico): vale o limite fixo antigo (300 H / 5000 KM).
drop function if exists public.qr_equipamento(uuid, text);
alter table public.equipamentos drop column if exists limite_salto;
alter table public.equipamentos add column if not exists horimetro_atualizado_em timestamptz;
alter table public.configuracoes_sistema
  add column if not exists limite_km_dia numeric not null default 200,
  add column if not exists tolerancia_horas numeric not null default 0.5;

create or replace function app.limite_salto(p_un text, p_base timestamptz, p_quando timestamptz default now())
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare c public.configuracoes_sistema%rowtype; h numeric; km boolean := upper(coalesce(p_un, 'H')) = 'KM';
begin
  select * into c from public.configuracoes_sistema limit 1;
  if p_base is null then
    return case when km then coalesce(c.limite_salto_km, 5000) else coalesce(c.limite_salto_horas, 300) end;
  end if;
  h := greatest(0, extract(epoch from (least(coalesce(p_quando, now()), now()) - p_base)) / 3600.0);
  if km then return coalesce(c.limite_km_dia, 200) * greatest(1, ceil(h / 24.0)); end if;
  return h + coalesce(c.tolerancia_horas, 0.5);
end $$;
revoke all on function app.limite_salto(text, timestamptz, timestamptz) from public;
grant execute on function app.limite_salto(text, timestamptz, timestamptz) to anon, authenticated;

-- Carimbo: guarda QUANDO o horímetro mudou (hora da leitura; nunca no futuro nem antes da leitura anterior).
create or replace function app.carimbo_horimetro() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.horimetro_atual, 0) > 0 and new.horimetro_atualizado_em is null then
      new.horimetro_atualizado_em := now();
    end if;
    return new;
  end if;
  if new.horimetro_atual is distinct from old.horimetro_atual then
    if new.horimetro_atualizado_em is null or new.horimetro_atualizado_em is not distinct from old.horimetro_atualizado_em then
      new.horimetro_atualizado_em := now();
    else
      new.horimetro_atualizado_em := least(new.horimetro_atualizado_em, now());
      if old.horimetro_atualizado_em is not null then
        new.horimetro_atualizado_em := greatest(new.horimetro_atualizado_em, old.horimetro_atualizado_em);
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_carimbo_horimetro on public.equipamentos;
create trigger trg_carimbo_horimetro before insert or update on public.equipamentos
  for each row execute function app.carimbo_horimetro();

create or replace function public.qr_equipamento(p_id uuid default null, p_tag text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from (
    select e.id, e.tag, e.nome, e.unidade_medida, e.horimetro_atual, e.obra_id, e.horimetro_atualizado_em,
           (select jsonb_build_object('limite_km_dia', c.limite_km_dia, 'tolerancia_horas', c.tolerancia_horas,
                                      'fixo_horas', c.limite_salto_horas, 'fixo_km', c.limite_salto_km)
            from public.configuracoes_sistema c limit 1) as cfg
    from public.equipamentos e
    where (p_id is not null and e.id = p_id)
       or (p_id is null and p_tag is not null and upper(e.tag) = upper(btrim(p_tag)))
    limit 1) x
$$;
grant execute on function public.qr_equipamento(uuid, text) to anon, authenticated;
revoke all on function public.qr_equipamento(uuid, text) from public;

create or replace function public.lancar_horimetro(
  p_equipamento uuid, p_leitura numeric, p_operador text default '',
  p_registrado_em timestamptz default null, p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_eq public.equipamentos%rowtype;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_op text := left(btrim(coalesce(p_operador, '')), 80);
  v_quando timestamptz := least(coalesce(p_registrado_em, now()), now());
  v_ultimo timestamptz;
  v_limite numeric;
  v_atual numeric;
begin
  if p_equipamento is null or p_leitura is null or p_leitura <= 0 then
    raise exception 'LEITURA_INVALIDA: informe a leitura do painel.' using errcode = 'P0001';
  end if;
  if v_op = '' then
    raise exception 'OPERADOR_OBRIGATORIO: informe matrícula ou nome.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.diario_horimetro where id = v_id) then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;

  select * into v_eq from public.equipamentos where id = p_equipamento for update;
  if not found then
    raise exception 'EQUIPAMENTO_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;
  v_limite := app.limite_salto(v_eq.unidade_medida, v_eq.horimetro_atualizado_em, v_quando);
  v_atual := coalesce(v_eq.horimetro_atual, 0);
  select max(registrado_em) into v_ultimo from public.diario_horimetro where equipamento_id = p_equipamento;

  if v_atual > 0 and p_leitura < v_atual then
    if v_ultimo is not null and v_quando < v_ultimo then
      insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em)
      values (v_id, p_equipamento, p_leitura, v_op, v_quando);
      return jsonb_build_object('ok', true, 'atrasado', true, 'horimetro_atual', v_atual);
    end if;
    raise exception 'LEITURA_MENOR: a leitura % é menor que a atual (%).', p_leitura, v_atual using errcode = 'P0001';
  end if;
  if v_atual > 0 and (p_leitura - v_atual) > v_limite then
    raise exception 'SALTO_ALTO: desde a última leitura o máximo possível seria subir % (subiu %).',
      round(v_limite, 1), round(p_leitura - v_atual, 1) using errcode = 'P0001';
  end if;

  insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em)
  values (v_id, p_equipamento, p_leitura, v_op, v_quando);
  update public.equipamentos set horimetro_atual = p_leitura, horimetro_atualizado_em = v_quando where id = p_equipamento;
  return jsonb_build_object('ok', true, 'horimetro_atual', p_leitura);
end $$;

drop function if exists app.limite_salto_efetivo(text, numeric);
