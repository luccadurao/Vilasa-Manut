-- Controle de diesel (aditivo). Fontes: 'cta' (prevalece) e 'planilha'.
-- Chave de tag: maiúsculas, sem espaços/hífens, número sem zeros à esquerda.
create or replace function app.chave_tag(p text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(upper(coalesce(p,'')), '[\s-]', '', 'g'), '([A-Z])0+([0-9])', '\1\2', 'g')
$$;

create table if not exists public.diesel_tanques (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,          -- ex.: TF-05, TF-11, CL-11, CLAL-12
  nome text,
  tipo text not null default 'FIXO' check (tipo in ('FIXO','COMBOIO')),
  capacidade_l numeric,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.diesel_carregamentos (
  id uuid primary key default gen_random_uuid(),
  tanque_id uuid not null references public.diesel_tanques(id),
  data date not null,
  litros numeric not null check (litros > 0),
  preco_litro numeric, custo_total numeric,
  nota_fiscal text, fornecedor text,
  fonte text not null check (fonte in ('cta','planilha')),
  chave_externa text not null,
  criado_em timestamptz not null default now(),
  unique (fonte, chave_externa)
);
create index if not exists ix_dcarr_tanque_data on public.diesel_carregamentos (tanque_id, data);

create table if not exists public.diesel_abastecimentos (
  id uuid primary key default gen_random_uuid(),
  tanque_id uuid references public.diesel_tanques(id),
  data date not null, hora time,
  frota_texto text,                      -- como veio na fonte
  chave_tag text,                        -- normalizada
  equipamento_id uuid references public.equipamentos(id),
  litros numeric not null check (litros >= 0),
  horimetro numeric, odometro numeric,
  encerrante_ini numeric, encerrante_fim numeric,
  transferencia boolean not null default false,  -- tanque -> comboio: não é consumo
  suspeito boolean not null default false,
  motivo_suspeito text,
  fonte text not null check (fonte in ('cta','planilha')),
  chave_externa text not null,
  criado_em timestamptz not null default now(),
  unique (fonte, chave_externa)
);
create index if not exists ix_dabast_equip_data on public.diesel_abastecimentos (equipamento_id, data);
create index if not exists ix_dabast_tanque_data on public.diesel_abastecimentos (tanque_id, data);
create index if not exists ix_dabast_chave on public.diesel_abastecimentos (chave_tag);

create table if not exists public.diesel_estoque_diario (
  tanque_id uuid not null references public.diesel_tanques(id),
  data date not null,
  estoque_inicial numeric, carregamentos numeric, transferencias numeric, abastecido numeric,
  final_teorico numeric, final_fisico numeric, dispersao numeric,
  primary key (tanque_id, data)
);

-- Vincula abastecimentos sem equipamento: tag exata ou CTA 'X'+tag (equipamento próprio).
create or replace function public.diesel_vincular_equipamentos() returns integer
language plpgsql security definer set search_path = public, app as $$
declare n integer;
begin
  if not app.tem_cargo('pcm') and not app.tem_cargo('engenheiro') and not app.tem_cargo('admin') then
    raise exception 'sem permissão';
  end if;
  update public.diesel_abastecimentos a set equipamento_id = e.id
  from public.equipamentos e
  where a.equipamento_id is null and a.chave_tag is not null
    and (app.chave_tag(e.tag) = a.chave_tag
         or ('X' || app.chave_tag(e.tag)) = a.chave_tag);
  get diagnostics n = row_count;
  return n;
end $$;

do $$
declare t text;
begin
  foreach t in array array['diesel_tanques','diesel_carregamentos','diesel_abastecimentos','diesel_estoque_diario'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.perfil_ativo())', t||'_sel', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.tem_cargo(''pcm'') or app.tem_cargo(''engenheiro'') or app.tem_cargo(''admin'')) with check (app.tem_cargo(''pcm'') or app.tem_cargo(''engenheiro'') or app.tem_cargo(''admin''))', t||'_ins', t);
  end loop;
end $$;

insert into public.diesel_tanques (codigo, nome, tipo) values
  ('TF-05','Tanque fixo TF-05','FIXO'), ('TF-11','Tanque fixo TF-11','FIXO'),
  ('CL-11','Comboio CL-11','COMBOIO'), ('CLAL-12','Comboio CL-AL-12','COMBOIO')
on conflict (codigo) do nothing;
