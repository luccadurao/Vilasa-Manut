-- =============================================================================
-- 0006_nome_neutro_reverter.sql — plataforma
-- Desfaz a 0006: meu_perfil volta ao texto da 0005 (sem locais_permitidos) e
-- app.email_interno volta ao texto da 0003. Idempotente.
--   psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
-- Usuários criados enquanto a 0006 valia mantêm o e-mail gravado
-- (…@codigo.login.invalid) e continuam entrando: o login lê email_login.
-- =============================================================================
SET search_path = '';

CREATE OR REPLACE FUNCTION public.meu_perfil()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT to_jsonb(x) FROM (
    SELECT
      p.id,
      p.matricula,
      p.nome,
      p.cargos_lista,
      p.obras_permitidas,
      p.ativo,
      p.empresa_id,
      app.versao_minima_app(p.empresa_id) AS versao_minima_app,
      (
        SELECT jsonb_build_object(
          'id', e.id, 'codigo', e.codigo, 'nome', e.nome, 'marca', e.marca, 'termos', e.termos
        )
        FROM public.empresas e
        WHERE e.id = p.empresa_id
      ) AS empresa,
      (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', em.modulo_id, 'versao_config', em.config_versao, 'config', em.config
        ) ORDER BY em.modulo_id), '[]'::jsonb)
        FROM public.empresa_modulos em
        WHERE em.empresa_id = p.empresa_id
          AND em.ativo
          AND (em.inicio IS NULL OR em.inicio <= CURRENT_DATE)
          AND (em.valido_ate IS NULL OR em.valido_ate >= CURRENT_DATE)
      ) AS modulos,
      (
        SELECT coalesce(jsonb_agg(perm.id ORDER BY perm.id), '[]'::jsonb)
        FROM public.permissoes perm
        WHERE app.pode(perm.id)
      ) AS permissoes
    FROM public.perfis_usuarios p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1
  ) x
$function$;

REVOKE ALL ON FUNCTION public.meu_perfil() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_perfil() TO authenticated;

CREATE OR REPLACE FUNCTION app.email_interno(p_matricula text, p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN app.slug_login(p_codigo) IN ('', 'vilasa')
      THEN app.slug_login(p_matricula) || app.dominio_login()
    ELSE app.slug_login(p_matricula) || '@' || app.slug_login(p_codigo) || '.vilasa.invalid'
  END
$function$;

REVOKE ALL ON FUNCTION app.email_interno(text, text) FROM PUBLIC, anon, authenticated;

DELETE FROM public.migracoes_aplicadas
WHERE escopo = 'plataforma' AND arquivo = '0006_nome_neutro.sql';
