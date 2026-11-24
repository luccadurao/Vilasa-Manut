-- =============================================================================
-- testes_0005.sql — conferência da etapa 6, só leitura.
-- Rode depois da 0005, como o papel que aplicou a migração:
--   psql -1 -v ON_ERROR_STOP=1 -f banco/docs/testes_0005.sql
-- Não há INSERT, UPDATE, DELETE nem DDL. O bloco só faz SELECT e ASSERT.
--
-- Cobre: os_abrir_pelo_qr com app.exigir('os.abrir'), anon sem EXECUTE,
-- versao_minima_app global e por empresa, e a leitura no meu_perfil.
-- Com a seed fictícia local, simula auth.uid() e confere que o almoxarife
-- não passa em os.abrir e o mecânico passa. Sem esses perfis, essa parte
-- é pulada. Não grava OS.
-- =============================================================================

DO $$
DECLARE
  v_empresa uuid := '00000000-0000-0000-0000-000000000001';
  v_def text;
  v_global text;
  v_outra uuid;
  v_mecanico uuid;
  v_almox uuid;
  v_modulos jsonb;
BEGIN
  IF to_regprocedure('public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)') IS NULL THEN
    RAISE EXCEPTION 'falta public.os_abrir_pelo_qr';
  END IF;
  v_def := pg_get_functiondef('public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)'::regprocedure);
  IF position('app.exigir' IN v_def) = 0 OR position('os.abrir' IN v_def) = 0 THEN
    RAISE EXCEPTION 'os_abrir_pelo_qr não exige os.abrir';
  END IF;
  IF position('security definer' IN lower(v_def)) = 0 OR position('search_path' IN lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'os_abrir_pelo_qr precisa ser security definer com search_path';
  END IF;
  IF position('p_tag' IN lower(v_def)) <> 0 OR position('upper(e.tag)' IN lower(v_def)) <> 0 THEN
    RAISE EXCEPTION 'os_abrir_pelo_qr não pode escolher a máquina pela tag';
  END IF;
  IF has_function_privilege('anon', 'public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa os_abrir_pelo_qr';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated não executa os_abrir_pelo_qr';
  END IF;

  IF to_regprocedure('app.versao_minima_app(uuid)') IS NULL THEN
    RAISE EXCEPTION 'falta app.versao_minima_app';
  END IF;
  IF has_function_privilege('anon', 'app.versao_minima_app(uuid)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.configuracoes_plataforma', 'SELECT')
     OR has_table_privilege('authenticated', 'public.configuracoes_plataforma', 'SELECT') THEN
    RAISE EXCEPTION 'a versão mínima ficou legível fora do meu_perfil';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'versao_minima_app'
  ) THEN
    RAISE EXCEPTION 'empresas.versao_minima_app não existe';
  END IF;

  SELECT valor INTO v_global
  FROM public.configuracoes_plataforma
  WHERE chave = 'versao_minima_app';
  IF v_global IS NULL OR btrim(v_global) = '' THEN
    RAISE EXCEPTION 'falta o valor global de versao_minima_app';
  END IF;
  IF app.versao_minima_app(v_empresa) IS DISTINCT FROM coalesce(
    (SELECT nullif(btrim(versao_minima_app), '') FROM public.empresas WHERE id = v_empresa),
    v_global
  ) THEN
    RAISE EXCEPTION 'app.versao_minima_app não preferiu a empresa e caiu no global';
  END IF;

  SELECT id INTO v_outra FROM public.empresas WHERE upper(codigo) = 'OUTRA-VERSAO' AND versao_minima_app IS NOT NULL;
  IF v_outra IS NOT NULL THEN
    IF app.versao_minima_app(v_outra) IS DISTINCT FROM (
      SELECT versao_minima_app FROM public.empresas WHERE id = v_outra
    ) THEN
      RAISE EXCEPTION 'a versão da empresa OUTRA-VERSAO não prevaleceu sobre a global';
    END IF;
    IF app.versao_minima_app(v_outra) = app.versao_minima_app(v_empresa)
       AND (SELECT versao_minima_app FROM public.empresas WHERE id = v_empresa) IS NULL THEN
      RAISE EXCEPTION 'empresa com versão própria devolveu o mesmo texto da global';
    END IF;
  END IF;

  v_def := pg_get_functiondef('public.meu_perfil()'::regprocedure);
  IF position('versao_minima_app' IN v_def) = 0 THEN
    RAISE EXCEPTION 'meu_perfil não lê versao_minima_app';
  END IF;

  v_def := pg_get_functiondef('public.qr_equipamento(uuid, text)'::regprocedure);
  IF position('p_id is null' IN lower(v_def)) = 0 OR position('upper(e.tag)' IN lower(v_def)) <> 0 THEN
    RAISE EXCEPTION 'qr_equipamento deixou de ser só por id';
  END IF;
  IF position('modulos_ativos' IN v_def) = 0 THEN
    RAISE EXCEPTION 'qr_equipamento não devolve os módulos ativos';
  END IF;

  IF EXISTS (SELECT 1 FROM public.equipamentos WHERE empresa_id = v_empresa) THEN
    SELECT modulos_ativos INTO v_modulos
    FROM (
      SELECT public.qr_equipamento(e.id) AS corpo
      FROM public.equipamentos e
      WHERE e.empresa_id = v_empresa
      LIMIT 1
    ) q,
    LATERAL (SELECT (q.corpo->'modulos_ativos') AS modulos_ativos) m;
    IF v_modulos IS NULL OR jsonb_typeof(v_modulos) <> 'array' THEN
      RAISE EXCEPTION 'qr_equipamento não devolveu a lista de módulos';
    END IF;
  END IF;

  SELECT p.auth_user_id INTO v_mecanico
  FROM public.perfis_usuarios p
  WHERE p.empresa_id = v_empresa
    AND coalesce(p.ativo, true)
    AND p.auth_user_id IS NOT NULL
    AND p.matricula = 'MEC-FICT'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(coalesce(p.cargos_lista, '[]'::jsonb)) c
      WHERE lower(btrim(c)) = 'mecanico'
    );

  SELECT p.auth_user_id INTO v_almox
  FROM public.perfis_usuarios p
  WHERE p.empresa_id = v_empresa
    AND coalesce(p.ativo, true)
    AND p.auth_user_id IS NOT NULL
    AND p.matricula = 'ALM-FICT'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(coalesce(p.cargos_lista, '[]'::jsonb)) c
      WHERE lower(btrim(c)) = 'almoxarife'
    );

  IF v_mecanico IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_mecanico::text, true);
    IF app.pode('os.abrir') IS NOT TRUE THEN
      RAISE EXCEPTION 'o mecânico fictício deveria poder os.abrir';
    END IF;
    PERFORM app.exigir('os.abrir');
    IF (public.meu_perfil()->>'versao_minima_app') IS NULL THEN
      RAISE EXCEPTION 'meu_perfil do mecânico não trouxe versao_minima_app';
    END IF;
  END IF;

  IF v_almox IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_almox::text, true);
    IF app.pode('os.abrir') IS TRUE THEN
      RAISE EXCEPTION 'o almoxarife fictício passou em os.abrir';
    END IF;
    BEGIN
      PERFORM app.exigir('os.abrir');
      RAISE EXCEPTION 'app.exigir não bloqueou o almoxarife';
    EXCEPTION
      WHEN SQLSTATE 'VM403' THEN NULL;
    END;
    IF NOT EXISTS (
      SELECT 1
      FROM public.cargo_permissoes cp
      WHERE cp.empresa_id = v_empresa
        AND cp.cargo_codigo = 'almoxarife'
        AND cp.permissao_id = 'os.ver'
    ) OR EXISTS (
      SELECT 1
      FROM public.cargo_permissoes cp
      WHERE cp.empresa_id = v_empresa
        AND cp.cargo_codigo = 'almoxarife'
        AND cp.permissao_id = 'os.abrir'
    ) THEN
      RAISE EXCEPTION 'a matriz do almoxarife deixou de ser ver sem abrir';
    END IF;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM app.exigir('os.abrir');
    RAISE EXCEPTION 'os.abrir passou sem sessão';
  EXCEPTION
    WHEN SQLSTATE 'VM403' THEN NULL;
  END;
END $$;

SELECT 'testes_0005 ok' AS resultado;
