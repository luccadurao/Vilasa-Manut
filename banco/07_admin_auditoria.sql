-- Auditoria do editor mestre do Admin (quem alterou/excluiu o quê). Aditivo.
create table if not exists public.admin_auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null, registro_id text, acao text not null,
  antes jsonb, depois jsonb, usuario_auth uuid default auth.uid(), criado_em timestamptz not null default now()
);
create index if not exists ix_admaud_tab on public.admin_auditoria (tabela, criado_em desc);
alter table public.admin_auditoria enable row level security;
create policy admaud_ins on public.admin_auditoria for insert to authenticated with check (app.tem_cargo('admin'));
create policy admaud_sel on public.admin_auditoria for select to authenticated using (app.tem_cargo('admin'));
