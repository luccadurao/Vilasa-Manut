-- =============================================================================
-- 0001_seguranca_minima.sql — Vilasa-Manut
-- Correção mínima de segurança aprovada pelo Lucca em 24/11/2026 17:42.
-- Testado SOMENTE na homologação (zqjgruwmqomgguxoxiuv). NÃO aplicado na produção.
-- Pré-requisito: esquema igual ao da produção de 24/11/2026 (0000_base_producao_2026-11-24.sql).
-- Idempotente: pode rodar mais de uma vez. Rodar como UMA transação: apply_migration e o SQL
-- editor do Supabase já fazem isso; via psql use `psql -1 -v ON_ERROR_STOP=1 -f`.
-- Reversão: 0001_seguranca_minima_reverter.sql (volta exatamente ao estado atual da produção).
--
-- O que muda (resumo):
--  1. anon perde TODO acesso a tabelas e sequences de public e app e o USAGE no schema app.
--     anon fica só com EXECUTE em 3 RPCs: resolver_login (tela de login), qr_equipamento e
--     lancar_horimetro (portal QR anônimo). Funções que estavam com EXECUTE para PUBLIC passam a
--     não ter (triggers continuam funcionando: o Postgres não confere EXECUTE ao disparar trigger).
--     diesel_vincular_equipamentos e app.chave_tag passam a ter search_path vazio (nomes já qualificados).
--     Privilégios padrão: tabela nova criada pelo postgres em public não dá nada a anon; função
--     nova criada pelo postgres não dá EXECUTE a PUBLIC.
--  2. perfis_usuarios: RLS ligado; anon sem acesso; authenticated só lê as colunas
--     (id, matricula, nome, cargos_lista, obras_permitidas, ativo) e só se tiver perfil ativo. senha_acesso, auth_user_id e
--     email_login ficam ilegíveis pela API (GRANT por coluna). Escrita só pelas RPCs de admin
--     (SECURITY DEFINER), que não dependem de GRANT.
--  3. Tabelas centrais: RLS ligado com UMA policy simples "authenticated com perfil ativo pode usar"
--     (app.perfil_ativo()). As 3 policies "Acesso App" (USING true para public) são removidas.
--     configuracoes_sistema: leitura para perfil ativo, alteração só admin, pin_operacao ilegível.
--     NÃO é o RBAC por cargo/obra (isso é a etapa 8).
--  4. GRANTs que faltavam para authenticated (causa dos 403): preventiva_* (S/I/U/D, as policies
--     existentes limitam a escrita a pcm/engenheiro/admin), os_pecas_previstas (S),
--     equipamentos_historico (S), admin_auditoria (S/I, policies só admin).
-- =============================================================================
SET search_path = '';

-- 0. Confere que o esquema esperado existe (aborta se não for o banco certo)
DO $$ BEGIN
  IF to_regclass('public.perfis_usuarios') IS NULL OR to_regprocedure('app.perfil_ativo()') IS NULL
     OR to_regprocedure('app.tem_cargo(text[])') IS NULL THEN
    RAISE EXCEPTION 'Esquema inesperado: perfis_usuarios/app.perfil_ativo/app.tem_cargo não encontrados';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Cortar acesso anon (desfaz o GRANT ALL do banco/03_reverter_rls.sql)
-- ---------------------------------------------------------------------------
-- (laço só nos objetos em que anon tem algum privilégio, para não mexer na ACL de quem já está fechado)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.oid::regclass AS obj, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname IN ('public', 'app') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
             AND EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = 'anon'::regrole)
  LOOP
    EXECUTE format('REVOKE ALL ON %s %s FROM anon', CASE WHEN r.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.obj);
  END LOOP;
END $$;
REVOKE USAGE ON SCHEMA app FROM anon;

-- Funções: ninguém executa por PUBLIC; anon só nas 3 RPCs do login e do portal QR.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_login(p_texto text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_equipamento(p_id uuid, p_tag text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lancar_horimetro(p_equipamento uuid, p_leitura numeric, p_operador text, p_registrado_em timestamp with time zone, p_id uuid) TO anon, authenticated;
-- authenticated mantém exatamente o EXECUTE que já tinha (as concessões explícitas não mudam).
-- service_role mantém o que já tinha.

-- search_path seguro: era 'public, app'; o corpo já usa nomes qualificados.
ALTER FUNCTION public.diesel_vincular_equipamentos() SET search_path = '';
-- app.chave_tag (SECURITY INVOKER, só funções de pg_catalog): fixa search_path vazio (alerta do advisor).
ALTER FUNCTION app.chave_tag(text) SET search_path = '';

-- Privilégios padrão (objetos criados no futuro pelo role postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Obs.: os privilégios padrão do role supabase_admin (usado por ferramentas internas do Supabase)
-- não podem ser alterados pelo postgres; migrações do projeto rodam como postgres.

-- ---------------------------------------------------------------------------
-- 2. perfis_usuarios
-- ---------------------------------------------------------------------------
ALTER TABLE public.perfis_usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.perfis_usuarios FROM anon, authenticated;
GRANT SELECT (id, matricula, nome, cargos_lista, obras_permitidas, ativo) ON TABLE public.perfis_usuarios TO authenticated;
DROP POLICY IF EXISTS perfis_sel_ativo ON public.perfis_usuarios;
CREATE POLICY perfis_sel_ativo ON public.perfis_usuarios
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT app.perfil_ativo()));
-- Sem policy/GRANT de INSERT/UPDATE/DELETE: cadastro e senha só por admin_salvar_usuario /
-- admin_definir_ativo (SECURITY DEFINER, conferem app.tem_cargo('admin')).

-- ---------------------------------------------------------------------------
-- 3. Tabelas centrais: RLS + policy mínima para authenticated com perfil ativo
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso App Apontamentos" ON public.apontamentos_os;
DROP POLICY IF EXISTS "Acesso App Config" ON public.configuracoes_sistema;
DROP POLICY IF EXISTS "Acesso App Itens Estoque" ON public.itens_os_estoque;
ALTER TABLE public.apontamentos_os ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apontamentos_os_autenticado_ativo ON public.apontamentos_os;
CREATE POLICY apontamentos_os_autenticado_ativo ON public.apontamentos_os AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_horimetro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diario_horimetro_autenticado_ativo ON public.diario_horimetro;
CREATE POLICY diario_horimetro_autenticado_ativo ON public.diario_horimetro AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipamentos_autenticado_ativo ON public.equipamentos;
CREATE POLICY equipamentos_autenticado_ativo ON public.equipamentos AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.execucoes_preventiva ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS execucoes_preventiva_autenticado_ativo ON public.execucoes_preventiva;
CREATE POLICY execucoes_preventiva_autenticado_ativo ON public.execucoes_preventiva AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.itens_os_estoque ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS itens_os_estoque_autenticado_ativo ON public.itens_os_estoque;
CREATE POLICY itens_os_estoque_autenticado_ativo ON public.itens_os_estoque AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.lotes_estoque ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lotes_estoque_autenticado_ativo ON public.lotes_estoque;
CREATE POLICY lotes_estoque_autenticado_ativo ON public.lotes_estoque AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.movimentacoes_almoxarifado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS movimentacoes_almoxarifado_autenticado_ativo ON public.movimentacoes_almoxarifado;
CREATE POLICY movimentacoes_almoxarifado_autenticado_ativo ON public.movimentacoes_almoxarifado AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obras_autenticado_ativo ON public.obras;
CREATE POLICY obras_autenticado_ativo ON public.obras AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordens_servico_autenticado_ativo ON public.ordens_servico;
CREATE POLICY ordens_servico_autenticado_ativo ON public.ordens_servico AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.pecas_estoque ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pecas_estoque_autenticado_ativo ON public.pecas_estoque;
CREATE POLICY pecas_estoque_autenticado_ativo ON public.pecas_estoque AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.planos_preventiva ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planos_preventiva_autenticado_ativo ON public.planos_preventiva;
CREATE POLICY planos_preventiva_autenticado_ativo ON public.planos_preventiva AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
ALTER TABLE public.servicos_almoxarifado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS servicos_almoxarifado_autenticado_ativo ON public.servicos_almoxarifado;
CREATE POLICY servicos_almoxarifado_autenticado_ativo ON public.servicos_almoxarifado AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT app.perfil_ativo())) WITH CHECK ((SELECT app.perfil_ativo()));
-- configuracoes_sistema: o app não lê esta tabela direto (os limites chegam pela RPC qr_equipamento).
REVOKE ALL ON TABLE public.configuracoes_sistema FROM authenticated;
GRANT SELECT (id, delta_maximo_horimetro, updated_at, limite_salto_horas, limite_salto_km, limite_km_dia, tolerancia_horas) ON TABLE public.configuracoes_sistema TO authenticated;
GRANT UPDATE (delta_maximo_horimetro, updated_at, limite_salto_horas, limite_salto_km, limite_km_dia, tolerancia_horas) ON TABLE public.configuracoes_sistema TO authenticated;
DROP POLICY IF EXISTS cfg_sel_ativo ON public.configuracoes_sistema;
CREATE POLICY cfg_sel_ativo ON public.configuracoes_sistema AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT app.perfil_ativo()));
DROP POLICY IF EXISTS cfg_upd_admin ON public.configuracoes_sistema;
CREATE POLICY cfg_upd_admin ON public.configuracoes_sistema AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT app.tem_cargo('admin'))) WITH CHECK ((SELECT app.tem_cargo('admin')));

-- ---------------------------------------------------------------------------
-- 4. GRANTs que faltavam (causa dos 403); as policies existentes continuam valendo
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.preventiva_estrategias, public.preventiva_pacotes, public.preventiva_listas,
  public.preventiva_lista_tarefas, public.preventiva_lista_materiais TO authenticated;
GRANT SELECT ON TABLE public.os_pecas_previstas, public.equipamentos_historico TO authenticated;
GRANT SELECT, INSERT ON TABLE public.admin_auditoria TO authenticated;

