-- HISTÓRICO DE LEITURAS: dois medidores por equipamento (horímetro e KM) + importação por planilha, repetível sem duplicar.
alter table public.diario_horimetro
  add column if not exists medidor text not null default 'H',
  add column if not exists origem text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'diario_horimetro_medidor_chk') then
    alter table public.diario_horimetro add constraint diario_horimetro_medidor_chk check (medidor in ('H', 'KM'));
  end if;
end $$;
create index if not exists ix_diario_equip_medidor on public.diario_horimetro (equipamento_id, medidor, registrado_em desc);

-- Leitura lançada pelo QR/OS passa a gravar o medidor certo (o da unidade do equipamento).
create or replace function public.lancar_horimetro(p_equipamento uuid, p_leitura numeric, p_operador text default ''::text, p_registrado_em timestamptz default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_eq public.equipamentos%rowtype;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_op text := left(btrim(coalesce(p_operador, '')), 80);
  v_quando timestamptz := least(coalesce(p_registrado_em, now()), now());
  v_ultimo timestamptz; v_limite numeric; v_atual numeric; v_med text;
begin
  if p_equipamento is null or p_leitura is null or p_leitura <= 0 then
    raise exception 'LEITURA_INVALIDA: informe a leitura do painel.' using errcode = 'P0001';
  end if;
  if v_op = '' then raise exception 'OPERADOR_OBRIGATORIO: informe matrícula ou nome.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.diario_horimetro where id = v_id) then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;
  select * into v_eq from public.equipamentos where id = p_equipamento for update;
  if not found then raise exception 'EQUIPAMENTO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  v_med := case when upper(coalesce(v_eq.unidade_medida, 'H')) = 'KM' then 'KM' else 'H' end;
  v_limite := app.limite_salto(v_eq.unidade_medida, v_eq.horimetro_atualizado_em, v_quando);
  v_atual := coalesce(v_eq.horimetro_atual, 0);
  select max(registrado_em) into v_ultimo from public.diario_horimetro where equipamento_id = p_equipamento and medidor = v_med;

  if v_atual > 0 and p_leitura < v_atual then
    if v_ultimo is not null and v_quando < v_ultimo then
      insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor)
      values (v_id, p_equipamento, p_leitura, v_op, v_quando, v_med);
      return jsonb_build_object('ok', true, 'atrasado', true, 'horimetro_atual', v_atual);
    end if;
    raise exception 'LEITURA_MENOR: a leitura % é menor que a atual (%).', p_leitura, v_atual using errcode = 'P0001';
  end if;
  if v_atual > 0 and (p_leitura - v_atual) > v_limite then
    raise exception 'SALTO_ALTO: desde a última leitura o máximo possível seria subir % (subiu %).',
      round(v_limite, 1), round(p_leitura - v_atual, 1) using errcode = 'P0001';
  end if;
  insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor)
  values (v_id, p_equipamento, p_leitura, v_op, v_quando, v_med);
  update public.equipamentos set horimetro_atual = p_leitura, horimetro_atualizado_em = v_quando where id = p_equipamento;
  return jsonb_build_object('ok', true, 'horimetro_atual', p_leitura);
end $$;

-- Importa leituras [{t: 'PREFIXO', m: 'H'|'KM', d: 'AAAA-MM-DD', v: 123.4}]. Mesmo dado reenviado não duplica.
create or replace function public.importar_leituras(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_recebidas int; v_inseridas int;
begin
  if not app.tem_cargo('admin', 'engenheiro') then
    raise exception 'SEM_PERMISSAO: só admin ou engenharia importam leituras.' using errcode = '42501';
  end if;
  select count(*) into v_recebidas from jsonb_to_recordset(p) as x(t text, m text, d date, v numeric);
  with ins as (
    insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, origem)
    select md5('imp|' || e.id::text || '|' || upper(x.m) || '|' || x.d::text)::uuid, e.id, x.v, 'IMPORTADO PLANILHA',
           least((x.d::text || ' 18:00:00-03')::timestamptz, now()), upper(x.m), 'planilha_parte_diaria'
    from jsonb_to_recordset(p) as x(t text, m text, d date, v numeric)
    join public.equipamentos e on upper(e.tag) = upper(btrim(x.t))
    where x.v > 0 and upper(x.m) in ('H', 'KM')
    on conflict (id) do nothing
    returning 1)
  select count(*) into v_inseridas from ins;
  return jsonb_build_object('recebidas', v_recebidas, 'inseridas', v_inseridas, 'sem_equipamento_ou_repetidas', v_recebidas - v_inseridas);
end $$;

-- Atualiza o horímetro atual de cada equipamento com a última leitura do medidor principal.
-- Principal = horímetro (H) quando o equipamento tem 10+ leituras dele; senão, o da unidade cadastrada.
-- Só atualiza se a leitura do histórico for mais nova que a atual (nunca volta no tempo).
create or replace function public.recalcular_horimetro_atual() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_atualizados int; v_unidade int;
begin
  if not app.tem_cargo('admin', 'engenheiro') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  create temp table _princ on commit drop as
  select e.id,
         case when exists (select 1 from public.diario_horimetro d where d.equipamento_id = e.id and d.medidor = 'H' having count(*) >= 10) then 'H'
              when upper(coalesce(e.unidade_medida, 'H')) = 'KM' then 'KM' else 'H' end medidor
  from public.equipamentos e;
  create temp table _ult on commit drop as
  select distinct on (d.equipamento_id) d.equipamento_id id, d.leitura, d.registrado_em, d.medidor
  from public.diario_horimetro d join _princ p on p.id = d.equipamento_id and p.medidor = d.medidor
  order by d.equipamento_id, d.registrado_em desc, d.leitura desc;
  select count(*) into v_unidade from public.equipamentos e join _ult u on u.id = e.id
   where upper(coalesce(e.unidade_medida, 'H')) <> u.medidor;
  update public.equipamentos e
     set horimetro_atual = u.leitura, horimetro_atualizado_em = u.registrado_em, unidade_medida = u.medidor
    from _ult u
   where u.id = e.id and (e.horimetro_atualizado_em is null or e.horimetro_atualizado_em < u.registrado_em);
  get diagnostics v_atualizados = row_count;
  return jsonb_build_object('equipamentos_atualizados', v_atualizados, 'unidade_trocada_para_horimetro', v_unidade);
end $$;
revoke all on function public.importar_leituras(jsonb), public.recalcular_horimetro_atual() from public, anon;
grant execute on function public.importar_leituras(jsonb), public.recalcular_horimetro_atual() to authenticated;
