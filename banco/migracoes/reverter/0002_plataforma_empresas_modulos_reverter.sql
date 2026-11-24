-- =============================================================================
-- 0002_plataforma_empresas_modulos_reverter.sql — Vilasa-Manut
-- Desfaz 0002_plataforma_empresas_modulos.sql.
-- Volta meu_perfil() ao corpo da produção (id, matricula, nome, cargos_lista,
-- obras_permitidas, ativo). Não mexe em tabelas anteriores nem em empresa_id.
-- Idempotente: pode rodar de novo, e pode rodar mesmo se a 0002 não foi aplicada.
-- psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
-- =============================================================================
SET search_path = '';

CREATE OR REPLACE FUNCTION public.meu_perfil()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select to_jsonb(x) from (
    select p.id, p.matricula, p.nome, p.cargos_lista, p.obras_permitidas, p.ativo
    from public.perfis_usuarios p where p.auth_user_id = auth.uid() limit 1) x
$function$;

REVOKE ALL ON FUNCTION public.meu_perfil() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_perfil() TO authenticated;

-- As policies de modulos e permissoes citam empresa_modulos. Sem este DROP,
-- o Postgres recusa apagar empresa_modulos. O bloco ignora tabela que já saiu.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('public.empresas', 'empresas_sel_contexto'),
      ('public.modulos', 'modulos_sel_contexto'),
      ('public.empresa_modulos', 'empresa_modulos_sel_contexto'),
      ('public.empresa_modulos_historico', 'empresa_modulos_historico_sel_contexto'),
      ('public.permissoes', 'permissoes_sel_contexto'),
      ('public.cargos', 'cargos_sel_contexto'),
      ('public.cargo_permissoes', 'cargo_permissoes_sel_contexto'),
      ('public.plataforma_usuarios', 'plataforma_usuarios_sel_proprio')
    ) AS t(relacao, policy)
  LOOP
    IF to_regclass(r.relacao) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %s', r.policy, r.relacao);
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.cargo_permissoes;
DROP TABLE IF EXISTS public.empresa_modulos_historico;
DROP TABLE IF EXISTS public.empresa_modulos;
DROP TABLE IF EXISTS public.cargos;
DROP TABLE IF EXISTS public.permissoes;
DROP TABLE IF EXISTS public.plataforma_usuarios;
DROP TABLE IF EXISTS public.migracoes_aplicadas;
DROP TABLE IF EXISTS public.modulos;
DROP TABLE IF EXISTS public.empresas;

DROP FUNCTION IF EXISTS app.registrar_historico_empresa_modulos();
DROP FUNCTION IF EXISTS app.validar_empresa_modulos();
DROP FUNCTION IF EXISTS app.carimbar_empresa_modulos();
DROP FUNCTION IF EXISTS app.exigir(text);
DROP FUNCTION IF EXISTS app.pode(text);
DROP FUNCTION IF EXISTS app.avaliar_permissao(text, text[]);
DROP FUNCTION IF EXISTS app.modulo_ativo(text);
DROP FUNCTION IF EXISTS app.empresa_atual();
