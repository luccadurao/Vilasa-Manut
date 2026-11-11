-- Limite de salto do horímetro/odômetro POR EQUIPAMENTO.
-- Regra: o limite do equipamento só pode AFROUXAR o padrão (300 H / 5000 KM), nunca apertar.
-- Sem valor próprio (null), vale o padrão de configuracoes_sistema, igual ao que já era.
alter table public.equipamentos
  add column if not exists limite_salto numeric check (limite_salto is null or limite_salto > 0);

-- Limite efetivo = o maior entre o padrão da unidade e o limite próprio do equipamento.
create or replace function app.limite_salto_efetivo(p_unidade text, p_proprio numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select greatest(
    coalesce(p_proprio, 0),
    case when upper(coalesce(p_unidade, 'H')) = 'KM'
         then coalesce((select limite_salto_km from public.configuracoes_sistema limit 1), 5000)
         else coalesce((select limite_salto_horas from public.configuracoes_sistema limit 1), 300) end)
$$;
revoke all on function app.limite_salto_efetivo(text, numeric) from public;
grant execute on function app.limite_salto_efetivo(text, numeric) to anon, authenticated;

create or replace function public.qr_equipamento(p_id uuid default null, p_tag text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from (
    select e.id, e.tag, e.nome, e.unidade_medida, e.horimetro_atual, e.obra_id,
           app.limite_salto_efetivo(e.unidade_medida, e.limite_salto) as limite_salto
    from public.equipamentos e
    where (p_id is not null and e.id = p_id)
       or (p_id is null and p_tag is not null and upper(e.tag) = upper(btrim(p_tag)))
    limit 1) x
$$;

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
  v_limite := app.limite_salto_efetivo(v_eq.unidade_medida, v_eq.limite_salto);
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
    raise exception 'SALTO_ALTO: a leitura subiu mais de % de uma só vez.', v_limite using errcode = 'P0001';
  end if;

  insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em)
  values (v_id, p_equipamento, p_leitura, v_op, v_quando);
  update public.equipamentos set horimetro_atual = p_leitura where id = p_equipamento;
  return jsonb_build_object('ok', true, 'horimetro_atual', p_leitura);
end $$;
