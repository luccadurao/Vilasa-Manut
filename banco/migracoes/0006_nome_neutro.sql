-- =============================================================================
-- 0006_nome_neutro.sql — plataforma
-- Fase 0b do núcleo: nome neutro. Nada no banco depende mais do nome de um
-- cliente para funcionar.
-- Pré-requisito: 0000 a 0005. Idempotente. Uma transação:
--   psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
-- Reversão: banco/migracoes/reverter/0006_nome_neutro_reverter.sql
--
-- O que faz:
--   1. meu_perfil passa a devolver também locais_permitidos (o mesmo dado de
--      perfis_usuarios.obras_permitidas). obras_permitidas continua no retorno
--      para o app antigo; a coluna não muda de nome nesta migração.
--   2. app.email_interno deixa de tratar o código 'vilasa' como especial. Todo
--      usuário NOVO ganha matricula@codigo.login.invalid.
--   3. Empresa cujo termo de local é "Obra" (gravado pela 0004) e que não tem
--      gênero ganha 'local.nivel1.genero' = 'f'. O termo padrão do produto
--      passou a ser "Local" (masculino) e o front monta as frases pelo gênero.
--
-- O que NÃO faz, de propósito:
--   - não muda o e-mail de nenhum usuário que já existe: o login lê
--     perfis_usuarios.email_login, que está gravado;
--   - não renomeia coluna, tabela nem view (obras, obra_id, obras_permitidas):
--     isso fica para quando os módulos migrarem;
--   - não mexe em app.dominio_login(): admin_salvar_usuario compara o e-mail com
--     ela para recusar matrícula vazia, e email_interno continua devolvendo esse
--     valor nesse caso.
-- =============================================================================
SET search_path = '';

DO $$ BEGIN
  IF to_regprocedure('public.meu_perfil()') IS NULL
     OR to_regprocedure('app.email_interno(text, text)') IS NULL
     OR to_regprocedure('app.slug_login(text)') IS NULL
     OR to_regprocedure('app.dominio_login()') IS NULL
     OR to_regprocedure('app.versao_minima_app(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Esquema inesperado: aplique a 0000 a 0005 antes da 0006';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. meu_perfil com locais_permitidos (texto da 0005 + um campo).
-- ---------------------------------------------------------------------------
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
      p.obras_permitidas AS locais_permitidos,
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

-- meu_perfil é exceção do portal (CLAUDE.md, regra 4): não chama app.exigir,
-- só devolve o perfil de quem está logado. Privilégios iguais aos da 0002.
REVOKE ALL ON FUNCTION public.meu_perfil() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_perfil() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. E-mail interno de usuário novo, sem nome de cliente.
--    Matrícula vazia devolve app.dominio_login(), para admin_salvar_usuario
--    continuar recusando com "Login inválido.".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.email_interno(p_matricula text, p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN app.slug_login(p_matricula) = '' THEN app.dominio_login()
    ELSE app.slug_login(p_matricula) || '@'
         || coalesce(nullif(app.slug_login(p_codigo), ''), 'empresa')
         || '.login.invalid'
  END
$function$;

REVOKE ALL ON FUNCTION app.email_interno(text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Gênero do termo de local para quem usa "Obra". Só acrescenta a chave
--    que falta; chave que a empresa já gravou fica.
-- ---------------------------------------------------------------------------
UPDATE public.empresas
SET termos = termos || '{"local.nivel1.genero": "f"}'::jsonb
WHERE termos ->> 'local.nivel1' = 'Obra'
  AND NOT (termos ? 'local.nivel1.genero');

-- ---------------------------------------------------------------------------
-- Registro
-- ---------------------------------------------------------------------------
INSERT INTO public.migracoes_aplicadas (escopo, modulo_id, arquivo, checksum, aplicado_por)
VALUES ('plataforma', NULL, '0006_nome_neutro.sql', md5('0006_nome_neutro.sql'), current_user)
ON CONFLICT (escopo, arquivo) DO NOTHING;

DO $$ BEGIN
  IF has_function_privilege('anon', 'public.meu_perfil()', 'EXECUTE')
     OR has_function_privilege('anon', 'app.email_interno(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ficou com privilégio da 0006';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.meu_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou sem meu_perfil';
  END IF;
END $$;
