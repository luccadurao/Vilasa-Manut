-- FROTA: histórico de alterações do cadastro + correção manual de leitura (PCM). Aditivo.
alter table public.diario_horimetro add column if not exists motivo text;

create table if not exists public.equipamentos_historico (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  campo text not null, valor_antigo text, valor_novo text,
  alterado_por uuid, alterado_em timestamptz not null default now()
);
create index if not exists ix_eqhist_eq on public.equipamentos_historico (equipamento_id, alterado_em desc);

create or replace function app.log_alteracao_equipamento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text; v_old text; v_new text;
begin
  foreach c in array array['tag','nome','marca','modelo','numero_serie','placa','ano_fabricacao','propriedade','situacao_ciclo','unidade_medida','obra_id'] loop
    execute format('select ($1).%I::text, ($2).%I::text', c, c) into v_old, v_new using old, new;
    if v_old is distinct from v_new then
      insert into public.equipamentos_historico (equipamento_id, campo, valor_antigo, valor_novo, alterado_por)
      values (new.id, c, v_old, v_new, auth.uid());
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_log_alteracao_equipamento on public.equipamentos;
create trigger trg_log_alteracao_equipamento after update on public.equipamentos for each row execute function app.log_alteracao_equipamento();

create or replace function public.corrigir_leitura(p_id uuid, p_equipamento uuid, p_medidor text, p_leitura numeric, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_eq public.equipamentos%rowtype; v_med text := upper(btrim(coalesce(p_medidor, ''))); v_nome text;
begin
  if not app.tem_cargo('pcm', 'engenheiro', 'admin') then
    raise exception 'SEM_PERMISSAO: só PCM, engenharia ou admin corrigem leituras.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'MOTIVO_OBRIGATORIO: informe o motivo da correção.' using errcode = 'P0001'; end if;
  if p_leitura is null or p_leitura < 0 then raise exception 'LEITURA_INVALIDA' using errcode = 'P0001'; end if;
  if v_med not in ('H', 'KM') then raise exception 'MEDIDOR_INVALIDO' using errcode = 'P0001'; end if;
  if exists (select 1 from public.diario_horimetro where id = p_id) then return jsonb_build_object('ok', true, 'duplicado', true); end if;
  select * into v_eq from public.equipamentos where id = p_equipamento for update;
  if not found then raise exception 'EQUIPAMENTO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  if not app.obra_ok(v_eq.obra_id) then raise exception 'SEM_PERMISSAO: equipamento de outra obra.' using errcode = '42501'; end if;
  select nome into v_nome from public.perfis_usuarios where auth_user_id = auth.uid();
  if v_med = upper(coalesce(v_eq.unidade_medida, 'H')) then
    update public.equipamentos set horimetro_atual = p_leitura, horimetro_atualizado_em = now() where id = p_equipamento;
  else
    update public.equipamentos set km_atual = p_leitura, km_atualizado_em = now() where id = p_equipamento;
  end if;
  insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, origem, motivo)
  values (p_id, p_equipamento, p_leitura, 'CORREÇÃO: ' || coalesce(v_nome, 'PCM'), now(), v_med, 'correcao', btrim(p_motivo));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.corrigir_leitura(uuid, uuid, text, numeric, text) from public, anon;
grant execute on function public.corrigir_leitura(uuid, uuid, text, numeric, text) to authenticated;

alter table public.equipamentos_historico enable row level security;
drop policy if exists eqhist_select on public.equipamentos_historico;
create policy eqhist_select on public.equipamentos_historico for select to authenticated using (true);
