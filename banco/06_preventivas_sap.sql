-- PREVENTIVAS ESTILO SAP PM: estratégia (pacotes hierárquicos) + lista de tarefas + plano + chamada que gera OS. Aditivo.
create table if not exists public.preventiva_listas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nome text not null,
  local_padrao text not null default 'OFICINA', duracao_horas numeric,
  ativa boolean not null default true, criado_em timestamptz not null default now()
);
create table if not exists public.preventiva_lista_tarefas (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.preventiva_listas(id) on delete cascade,
  ordem int not null default 0, descricao text not null
);
create table if not exists public.preventiva_lista_materiais (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.preventiva_listas(id) on delete cascade,
  peca_id uuid not null references public.pecas_estoque(id), quantidade numeric not null check (quantidade > 0),
  unique (lista_id, peca_id)
);
create table if not exists public.preventiva_estrategias (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nome text not null,
  unidade text not null default 'H' check (unidade in ('H','KM')),
  intervalo_base numeric not null check (intervalo_base > 0),
  horizonte numeric not null default 50 check (horizonte >= 0),   -- abre a OS quando faltar isto (H ou KM)
  ativa boolean not null default true
);
create table if not exists public.preventiva_pacotes (
  id uuid primary key default gen_random_uuid(),
  estrategia_id uuid not null references public.preventiva_estrategias(id) on delete cascade,
  multiplo int not null check (multiplo >= 1), nome text not null,
  lista_id uuid references public.preventiva_listas(id) on delete set null,
  acumulativo boolean not null default true,                       -- inclui as tarefas dos pacotes menores
  unique (estrategia_id, multiplo)
);
alter table public.planos_preventiva
  add column if not exists estrategia_id uuid references public.preventiva_estrategias(id),
  add column if not exists ciclo_atual int not null default 0,     -- último ciclo concluído (próximo = ciclo_atual + 1)
  add column if not exists ativo boolean not null default true,
  add column if not exists os_aberta_id uuid references public.ordens_servico(id) on delete set null;
create unique index if not exists ux_plano_equipamento on public.planos_preventiva (equipamento_id) where ativo;
alter table public.ordens_servico
  add column if not exists plano_id uuid references public.planos_preventiva(id) on delete set null,
  add column if not exists pacote text, add column if not exists ciclo int,
  add column if not exists contador_alvo numeric, add column if not exists checklist jsonb;
create unique index if not exists ux_os_plano_ciclo on public.ordens_servico (plano_id, ciclo) where plano_id is not null;
create table if not exists public.os_pecas_previstas (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  peca_id uuid not null references public.pecas_estoque(id), quantidade numeric not null,
  unique (os_id, peca_id)
);

-- pacote do ciclo n: maior múltiplo da estratégia que divide n (SAP: hierarquia de pacotes)
create or replace function app.pacote_do_ciclo(p_estrategia uuid, p_ciclo int) returns public.preventiva_pacotes
language sql stable security definer set search_path = '' as $$
  select pk.* from public.preventiva_pacotes pk
  where pk.estrategia_id = p_estrategia and p_ciclo % pk.multiplo = 0
  order by pk.multiplo desc limit 1
$$;

create or replace function public.preventiva_gerar_os(p_plano uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_pk public.preventiva_pacotes; v_n int; v_alvo numeric; v_os uuid; v_chk jsonb; v_qtd int := 0; v_loc text;
begin
  if auth.uid() is not null and not app.tem_cargo('pcm','engenheiro','admin') then
    raise exception 'SEM_PERMISSAO: só PCM, engenharia ou admin geram preventivas.' using errcode='42501';
  end if;
  for r in
    select p.*, e.horimetro_atual hor, e.obra_id, e.tag, s.horizonte, s.intervalo_base ib
    from public.planos_preventiva p
    join public.equipamentos e on e.id = p.equipamento_id
    join public.preventiva_estrategias s on s.id = p.estrategia_id and s.ativa
    where p.ativo and (p_plano is null or p.id = p_plano)
      and e.situacao_ciclo = 'ativo'
      and (p.os_aberta_id is null or exists (select 1 from public.ordens_servico o where o.id = p.os_aberta_id and o.status = 'concluida'))
    for update of p
  loop
    v_n := r.ciclo_atual + 1;
    v_alvo := coalesce(r.ultimo_horimetro_execucao, 0) + r.ib;
    continue when (v_alvo - coalesce(r.hor, 0)) > r.horizonte and p_plano is null;
    v_pk := app.pacote_do_ciclo(r.estrategia_id, v_n);
    if v_pk.id is null then continue; end if;
    continue when exists (select 1 from public.ordens_servico where plano_id = r.id and ciclo = v_n);
    select coalesce(jsonb_agg(jsonb_build_object('t', t.descricao, 'ok', false) order by pk2.multiplo, t.ordem), '[]'::jsonb)
      into v_chk
      from public.preventiva_pacotes pk2
      join public.preventiva_lista_tarefas t on t.lista_id = pk2.lista_id
      where pk2.estrategia_id = r.estrategia_id
        and (pk2.id = v_pk.id or (v_pk.acumulativo and pk2.multiplo < v_pk.multiplo and v_pk.multiplo % pk2.multiplo = 0));
    select coalesce(l.local_padrao, 'OFICINA') into v_loc from public.preventiva_listas l where l.id = v_pk.lista_id;
    insert into public.ordens_servico (equipamento_id, obra_id, status, motivo_rep, local_manutencao_pcm, descricao_problema, plano_id, pacote, ciclo, contador_alvo, checklist)
    values (r.equipamento_id, r.obra_id, 'aberta', 'PREVENTIVA', coalesce(v_loc, 'OFICINA'),
            'PREVENTIVA ' || v_pk.nome || ' (ciclo ' || v_n || ') - alvo ' || v_alvo, r.id, v_pk.nome, v_n, v_alvo, v_chk)
    returning id into v_os;
    insert into public.os_pecas_previstas (os_id, peca_id, quantidade)
    select v_os, m.peca_id, sum(m.quantidade)
      from public.preventiva_pacotes pk2 join public.preventiva_lista_materiais m on m.lista_id = pk2.lista_id
      where pk2.estrategia_id = r.estrategia_id
        and (pk2.id = v_pk.id or (v_pk.acumulativo and pk2.multiplo < v_pk.multiplo and v_pk.multiplo % pk2.multiplo = 0))
      group by m.peca_id;
    update public.planos_preventiva set os_aberta_id = v_os where id = r.id;
    v_qtd := v_qtd + 1;
  end loop;
  return jsonb_build_object('ok', true, 'geradas', v_qtd);
end $$;
revoke all on function public.preventiva_gerar_os(uuid) from public, anon;
grant execute on function public.preventiva_gerar_os(uuid) to authenticated;

-- ao concluir a OS preventiva: o próximo vencimento parte da leitura real da conclusão (SAP: "scheduling by completion")
create or replace function app.preventiva_ao_concluir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cont numeric;
begin
  if new.plano_id is null or new.status <> 'concluida' or old.status = 'concluida' then return new; end if;
  select coalesce(nullif(new.horimetro_os, 0), e.horimetro_atual) into v_cont from public.equipamentos e where e.id = new.equipamento_id;
  update public.planos_preventiva set ultimo_horimetro_execucao = v_cont,
         ultima_data_execucao = coalesce(new.concluida_em, now())::date,
         ultimo_pacote_executado = new.pacote, ciclo_atual = greatest(ciclo_atual, coalesce(new.ciclo, 0)), os_aberta_id = null
   where id = new.plano_id;
  insert into public.execucoes_preventiva (plano_id, equipamento_id, pacote, status, parada_obrigatoria, data_entrada, data_conclusao, horimetro_execucao, mecanicos_nomes, observacoes)
  values (new.plano_id, new.equipamento_id, new.pacote, 'concluida', true, new.aberta_em, coalesce(new.concluida_em, now()), v_cont, new.mecanico_nome, 'OS ' || new.numero_os);
  return new;
end $$;
create trigger trg_preventiva_ao_concluir after update of status on public.ordens_servico for each row execute function app.preventiva_ao_concluir();

-- RLS: todos autenticados leem; só PCM/engenharia/admin escrevem
do $$ declare t text; begin
  foreach t in array array['preventiva_listas','preventiva_lista_tarefas','preventiva_lista_materiais','preventiva_estrategias','preventiva_pacotes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_sel', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.tem_cargo(''pcm'',''engenheiro'',''admin'')) with check (app.tem_cargo(''pcm'',''engenheiro'',''admin''))', t||'_w', t);
  end loop;
end $$;
alter table public.os_pecas_previstas enable row level security;
create policy osprev_sel on public.os_pecas_previstas for select to authenticated using (true);
-- Estratégias, pacotes e listas ficam VAZIOS: o PCM monta por equipamento/família (horas ou km).

alter table public.execucoes_preventiva add column if not exists origem text not null default 'os';
