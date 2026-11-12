-- =============================================================================
-- VILASA CMMS - BANCO 02: ATIVAR RLS (regras de acesso por cargo e por obra)
--
-- ATENÇÃO: rode SOMENTE depois que o app novo (login seguro) estiver em produção.
-- Com o RLS ligado, o app antigo (login por perfis_usuarios) deixa de funcionar.
-- Para voltar atrás em segundos: banco/03_reverter_rls.sql
--
-- Quem acessa o quê (admin sempre pode tudo):
--   abrir OS ........ mecanico, almoxarife, encarregado, pcm, engenheiro
--   executar OS ..... mecanico, pcm, engenheiro
--   frota/preventiva  pcm, engenheiro
--   estoque ......... almoxarife, engenheiro
--   gestor/operador . somente leitura
--   anônimo ......... nada direto; só as funções do QR (qr_equipamento, lancar_horimetro)
-- =============================================================================

-- 0) Limpa políticas antigas (inclui as 3 "liberar tudo") para este script poder rodar de novo
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 1) Função auxiliar: acesso a todas as obras (calculada uma vez por consulta)
create or replace function app.acesso_global() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis_usuarios u
    where u.auth_user_id = auth.uid() and coalesce(u.ativo, true)
      and (
        exists (select 1 from jsonb_array_elements_text(u.cargos_lista) c
                where lower(btrim(c)) in ('admin', 'engenheiro', 'gestor'))
        or u.obras_permitidas is null or u.obras_permitidas = '[]'::jsonb
        or u.obras_permitidas @> '["TODAS"]'::jsonb
      ))
$$;
revoke all on function app.acesso_global() from public;
grant execute on function app.acesso_global() to authenticated;

-- 2) Trava no equipamento: quem não é PCM/Engenharia só mexe no horímetro, e só para cima
create or replace function app.guard_equipamentos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;              -- chamadas internas/administrativas
  if app.tem_cargo('pcm', 'engenheiro') then return new; end if;   -- (admin já incluído)
  if (to_jsonb(new) - 'horimetro_atual' - 'horimetro_atualizado_em')
     is distinct from (to_jsonb(old) - 'horimetro_atual' - 'horimetro_atualizado_em') then
    raise exception 'Seu perfil só pode atualizar o horímetro do equipamento.' using errcode = '42501';
  end if;
  if new.horimetro_atual is not null and old.horimetro_atual is not null then
    if new.horimetro_atual < old.horimetro_atual then
      raise exception 'O horímetro não pode diminuir. Peça a correção ao PCM/Engenharia.' using errcode = 'P0001';
    end if;
    -- Limite físico: horas -> no máximo o tempo que passou; KM -> no máximo 200 km por dia (app.limite_salto)
    if old.horimetro_atual > 0 and new.horimetro_atual > old.horimetro_atual
       and (new.horimetro_atual - old.horimetro_atual)
           > app.limite_salto(old.unidade_medida, old.horimetro_atualizado_em, new.horimetro_atualizado_em) then
      raise exception 'Aumento do horímetro maior que o possível desde a última leitura. Confira o valor no painel.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_equipamentos on public.equipamentos;
create trigger trg_guard_equipamentos before update on public.equipamentos
  for each row execute function app.guard_equipamentos();

-- 3) Senha antiga: ninguém lê (nem logado). Só as colunas abaixo.
revoke select on public.perfis_usuarios from anon, authenticated;
grant select (id, matricula, nome, cargos_lista, obras_permitidas, ativo, auth_user_id, email_login)
  on public.perfis_usuarios to authenticated;

-- 4) Anônimo não acessa tabela nenhuma diretamente (o QR usa funções próprias)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 5) Liga o RLS nas 14 tabelas
alter table public.obras                      enable row level security;
alter table public.perfis_usuarios            enable row level security;
alter table public.equipamentos               enable row level security;
alter table public.ordens_servico             enable row level security;
alter table public.diario_horimetro           enable row level security;
alter table public.planos_preventiva          enable row level security;
alter table public.execucoes_preventiva       enable row level security;
alter table public.pecas_estoque              enable row level security;
alter table public.movimentacoes_almoxarifado enable row level security;
alter table public.lotes_estoque              enable row level security;
alter table public.itens_os_estoque           enable row level security;
alter table public.servicos_almoxarifado      enable row level security;
alter table public.apontamentos_os            enable row level security;
alter table public.configuracoes_sistema      enable row level security;

-- 6) POLÍTICAS ----------------------------------------------------------------
-- obras
create policy obras_ler  on public.obras for select to authenticated using (app.ativo());
create policy obras_esc  on public.obras for all    to authenticated using (app.tem_cargo('admin')) with check (app.tem_cargo('admin'));

-- usuários
create policy perfis_ler on public.perfis_usuarios for select to authenticated using (app.ativo());
create policy perfis_esc on public.perfis_usuarios for all    to authenticated using (app.tem_cargo('admin')) with check (app.tem_cargo('admin'));

-- equipamentos (leitura por obra; a trava do horímetro está no trigger acima)
create policy eq_ler on public.equipamentos for select to authenticated
  using (app.ativo() and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy eq_ins on public.equipamentos for insert to authenticated
  with check (app.tem_cargo('pcm', 'engenheiro') and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy eq_upd on public.equipamentos for update to authenticated
  using (app.ativo() and ((select app.acesso_global()) or app.obra_ok(obra_id)))
  with check (app.tem_cargo('mecanico', 'almoxarife', 'encarregado', 'pcm', 'engenheiro')
              and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy eq_del on public.equipamentos for delete to authenticated using (app.tem_cargo('admin'));

-- ordens de serviço
create policy os_ler on public.ordens_servico for select to authenticated
  using (app.ativo() and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy os_ins on public.ordens_servico for insert to authenticated
  with check (app.tem_cargo('mecanico', 'almoxarife', 'encarregado', 'pcm', 'engenheiro')
              and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy os_upd on public.ordens_servico for update to authenticated
  using (app.tem_cargo('mecanico', 'pcm', 'engenheiro') and ((select app.acesso_global()) or app.obra_ok(obra_id)))
  with check (app.tem_cargo('mecanico', 'pcm', 'engenheiro') and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy os_del on public.ordens_servico for delete to authenticated using (app.tem_cargo('admin'));

-- diário de horímetro (escrita só pela função lancar_horimetro; admin pode corrigir)
create policy dh_ler on public.diario_horimetro for select to authenticated using (app.ativo());
create policy dh_esc on public.diario_horimetro for all    to authenticated using (app.tem_cargo('admin')) with check (app.tem_cargo('admin'));

-- preventivas
create policy plano_ler on public.planos_preventiva for select to authenticated using (app.ativo());
create policy plano_esc on public.planos_preventiva for all    to authenticated
  using (app.tem_cargo('pcm', 'engenheiro')) with check (app.tem_cargo('pcm', 'engenheiro'));
create policy exec_ler on public.execucoes_preventiva for select to authenticated using (app.ativo());
create policy exec_esc on public.execucoes_preventiva for all    to authenticated
  using (app.tem_cargo('pcm', 'engenheiro')) with check (app.tem_cargo('pcm', 'engenheiro'));

-- almoxarifado
create policy peca_ler on public.pecas_estoque for select to authenticated
  using (app.ativo() and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy peca_esc on public.pecas_estoque for all to authenticated
  using (app.tem_cargo('almoxarife', 'engenheiro') and ((select app.acesso_global()) or app.obra_ok(obra_id)))
  with check (app.tem_cargo('almoxarife', 'engenheiro') and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy mov_ler on public.movimentacoes_almoxarifado for select to authenticated
  using (app.ativo() and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy mov_esc on public.movimentacoes_almoxarifado for all to authenticated
  using (app.tem_cargo('almoxarife', 'engenheiro') and ((select app.acesso_global()) or app.obra_ok(obra_id)))
  with check (app.tem_cargo('almoxarife', 'engenheiro') and ((select app.acesso_global()) or app.obra_ok(obra_id)));
create policy lote_ler on public.lotes_estoque for select to authenticated using (app.ativo());
create policy lote_esc on public.lotes_estoque for all    to authenticated
  using (app.tem_cargo('almoxarife', 'engenheiro')) with check (app.tem_cargo('almoxarife', 'engenheiro'));
create policy serv_ler on public.servicos_almoxarifado for select to authenticated using (app.ativo());
create policy serv_esc on public.servicos_almoxarifado for all    to authenticated
  using (app.tem_cargo('almoxarife', 'engenheiro')) with check (app.tem_cargo('almoxarife', 'engenheiro'));
create policy itens_ler on public.itens_os_estoque for select to authenticated using (app.ativo());
create policy itens_ins on public.itens_os_estoque for insert to authenticated
  with check (app.tem_cargo('mecanico', 'almoxarife', 'pcm', 'engenheiro'));
create policy itens_upd on public.itens_os_estoque for update to authenticated
  using (app.tem_cargo('almoxarife', 'engenheiro')) with check (app.tem_cargo('almoxarife', 'engenheiro'));
create policy itens_del on public.itens_os_estoque for delete to authenticated using (app.tem_cargo('admin'));

-- apontamentos da OS
create policy apont_ler on public.apontamentos_os for select to authenticated using (app.ativo());
create policy apont_esc on public.apontamentos_os for all    to authenticated
  using (app.tem_cargo('mecanico', 'pcm', 'engenheiro')) with check (app.tem_cargo('mecanico', 'pcm', 'engenheiro'));

-- configurações
create policy cfg_ler on public.configuracoes_sistema for select to authenticated using (app.ativo());
create policy cfg_esc on public.configuracoes_sistema for all    to authenticated
  using (app.tem_cargo('admin')) with check (app.tem_cargo('admin'));
