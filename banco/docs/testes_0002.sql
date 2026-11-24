-- =============================================================================
-- testes_0002.sql — conferência da etapa 3, só leitura.
-- Rode no SQL editor da homologação, como o mesmo papel que aplicou a 0002
-- (postgres), depois da migração:
--   psql -1 -v ON_ERROR_STOP=1 -f banco/docs/testes_0002.sql
-- Não há INSERT, UPDATE, DELETE nem DDL. O bloco só faz SELECT e ASSERT
-- (RAISE EXCEPTION se algo divergir).
--
-- 1. A matriz gravada em cargo_permissoes da empresa 1 é a matriz traduzida
--    dos manifestos: sem operador e sem os.abrir para almoxarife.
-- 2. app.pode(permissão) = app.avaliar_permissao(permissão, app.cargos()).
--    Para cada cargo da matriz, o script chama app.avaliar_permissao com esse
--    cargo. É o que app.pode responde para um perfil que tem só esse cargo.
-- 3. Se já existir perfil ativo, o script personifica o JWT e compara
--    app.pode com app.avaliar_permissao, sem gravar nada.
-- 4. Sem sessão, app.exigir levanta SQLSTATE VM403.
-- =============================================================================

DO $$
DECLARE
  v_empresa uuid := '00000000-0000-0000-0000-000000000001';
  v_faltou text;
  v_sobrou text;
  v_def text;
  r record;
  perm record;
  v_cargos text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.empresas
    WHERE id = v_empresa AND codigo = 'VILASA' AND nome = 'Vilasa' AND ativa
  ) THEN
    RAISE EXCEPTION 'Empresa 1 (VILASA) não está no seed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.cargos WHERE codigo = 'operador') THEN
    RAISE EXCEPTION 'O seed não pode ter o cargo operador';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargo_permissoes
    WHERE empresa_id = v_empresa AND cargo_codigo = 'almoxarife' AND permissao_id = 'os.abrir'
  ) OR app.avaliar_permissao('os.abrir', ARRAY['almoxarife']) THEN
    RAISE EXCEPTION 'Almoxarife não pode ter os.abrir';
  END IF;

  IF NOT app.avaliar_permissao('os.ver', ARRAY['almoxarife']) THEN
    RAISE EXCEPTION 'Almoxarife precisa de os.ver';
  END IF;

  WITH esperado(cargo, permissao) AS (
    VALUES
-- <<matriz-traduzida>>
    ('admin', 'admin.modo_deus'),
    ('admin', 'admin.usuarios'),
    ('admin', 'admin.ver'),
    ('admin', 'diesel.gerenciar'),
    ('admin', 'diesel.ver'),
    ('admin', 'estoque.baixar'),
    ('admin', 'estoque.catalogo'),
    ('admin', 'estoque.entrada'),
    ('admin', 'estoque.ver'),
    ('admin', 'frota.gerenciar'),
    ('admin', 'frota.lancar_leitura'),
    ('admin', 'frota.ver'),
    ('admin', 'os.abrir'),
    ('admin', 'os.classificar_rep'),
    ('admin', 'os.executar'),
    ('admin', 'os.ver'),
    ('admin', 'painel.ver'),
    ('admin', 'preventivas.gerar_os'),
    ('admin', 'preventivas.gerenciar'),
    ('admin', 'preventivas.ver'),
    ('admin', 'relatorios.exportar'),
    ('almoxarife', 'estoque.baixar'),
    ('almoxarife', 'estoque.catalogo'),
    ('almoxarife', 'estoque.entrada'),
    ('almoxarife', 'estoque.ver'),
    ('almoxarife', 'frota.ver'),
    ('almoxarife', 'os.ver'),
    ('almoxarife', 'relatorios.exportar'),
    ('encarregado', 'os.abrir'),
    ('encarregado', 'os.ver'),
    ('engenheiro', 'diesel.gerenciar'),
    ('engenheiro', 'diesel.ver'),
    ('engenheiro', 'estoque.baixar'),
    ('engenheiro', 'estoque.catalogo'),
    ('engenheiro', 'estoque.entrada'),
    ('engenheiro', 'estoque.ver'),
    ('engenheiro', 'frota.gerenciar'),
    ('engenheiro', 'frota.lancar_leitura'),
    ('engenheiro', 'frota.ver'),
    ('engenheiro', 'os.abrir'),
    ('engenheiro', 'os.classificar_rep'),
    ('engenheiro', 'os.executar'),
    ('engenheiro', 'os.ver'),
    ('engenheiro', 'painel.ver'),
    ('engenheiro', 'preventivas.gerar_os'),
    ('engenheiro', 'preventivas.gerenciar'),
    ('engenheiro', 'preventivas.ver'),
    ('engenheiro', 'relatorios.exportar'),
    ('gestor', 'diesel.ver'),
    ('gestor', 'estoque.ver'),
    ('gestor', 'frota.ver'),
    ('gestor', 'os.ver'),
    ('gestor', 'painel.ver'),
    ('gestor', 'preventivas.ver'),
    ('gestor', 'relatorios.exportar'),
    ('mecanico', 'estoque.ver'),
    ('mecanico', 'frota.lancar_leitura'),
    ('mecanico', 'os.abrir'),
    ('mecanico', 'os.executar'),
    ('mecanico', 'os.ver'),
    ('mecanico', 'preventivas.ver'),
    ('pcm', 'diesel.gerenciar'),
    ('pcm', 'diesel.ver'),
    ('pcm', 'estoque.ver'),
    ('pcm', 'frota.gerenciar'),
    ('pcm', 'frota.ver'),
    ('pcm', 'os.abrir'),
    ('pcm', 'os.classificar_rep'),
    ('pcm', 'os.executar'),
    ('pcm', 'os.ver'),
    ('pcm', 'painel.ver'),
    ('pcm', 'preventivas.gerar_os'),
    ('pcm', 'preventivas.gerenciar'),
    ('pcm', 'preventivas.ver'),
    ('pcm', 'relatorios.exportar')
-- <<fim-matriz-traduzida>>
  ),
  gravado AS (
    SELECT cargo_codigo AS cargo, permissao_id AS permissao
    FROM public.cargo_permissoes
    WHERE empresa_id = v_empresa
  )
  SELECT
    (SELECT string_agg(cargo || ':' || permissao, ', ' ORDER BY cargo, permissao)
       FROM (SELECT cargo, permissao FROM esperado EXCEPT SELECT cargo, permissao FROM gravado) f),
    (SELECT string_agg(cargo || ':' || permissao, ', ' ORDER BY cargo, permissao)
       FROM (SELECT cargo, permissao FROM gravado EXCEPT SELECT cargo, permissao FROM esperado) s)
  INTO v_faltou, v_sobrou;

  IF v_faltou IS NOT NULL OR v_sobrou IS NOT NULL THEN
    RAISE EXCEPTION 'Matriz do seed divergiu da matriz traduzida. Faltou: %. Sobrou: %.',
      coalesce(v_faltou, '-'), coalesce(v_sobrou, '-');
  END IF;

  FOR r IN
    SELECT DISTINCT cargo FROM (
      SELECT cargo_codigo AS cargo FROM public.cargo_permissoes WHERE empresa_id = v_empresa
    ) c
  LOOP
    FOR perm IN SELECT id FROM public.permissoes LOOP
      IF app.avaliar_permissao(perm.id, ARRAY[r.cargo]) IS DISTINCT FROM EXISTS (
        SELECT 1 FROM public.cargo_permissoes cp
        WHERE cp.empresa_id = v_empresa AND cp.cargo_codigo = r.cargo AND cp.permissao_id = perm.id
      ) AND r.cargo <> 'admin' THEN
        RAISE EXCEPTION 'app.pode divergiu para o cargo % na permissão %', r.cargo, perm.id;
      END IF;
      IF r.cargo = 'admin' AND NOT app.avaliar_permissao(perm.id, ARRAY['admin']) THEN
        RAISE EXCEPTION 'app.pode do admin recusou % com todos os módulos ativos', perm.id;
      END IF;
    END LOOP;
  END LOOP;

  SELECT pg_get_functiondef('app.pode(text)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%app.avaliar_permissao%' OR v_def NOT LIKE '%app.cargos()%' THEN
    RAISE EXCEPTION 'app.pode não delega para app.avaliar_permissao(app.cargos())';
  END IF;
  IF position('security definer' in lower(v_def)) = 0 OR position('search_path' in lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'app.pode precisa ser security definer com search_path fixo';
  END IF;

  -- Perfis reais, se houver: app.pode tem de bater com a função pura. Não grava.
  FOR r IN
    SELECT p.auth_user_id,
           coalesce((
             SELECT array_agg(lower(btrim(c)))
             FROM jsonb_array_elements_text(p.cargos_lista) AS c
           ), ARRAY[]::text[]) AS cargos
    FROM public.perfis_usuarios p
    WHERE p.ativo IS NOT FALSE
      AND p.auth_user_id IS NOT NULL
      AND jsonb_typeof(p.cargos_lista) = 'array'
  LOOP
    PERFORM set_config('request.jwt.claim.sub', r.auth_user_id::text, true);
    v_cargos := r.cargos;
    FOR perm IN SELECT id FROM public.permissoes LOOP
      IF app.pode(perm.id) IS DISTINCT FROM app.avaliar_permissao(perm.id, v_cargos) THEN
        RAISE EXCEPTION 'app.pode divergiu para o usuário % na permissão %', r.auth_user_id, perm.id;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  BEGIN
    PERFORM app.exigir('os.abrir');
    RAISE EXCEPTION 'app.exigir não falhou sem sessão';
  EXCEPTION
    WHEN SQLSTATE 'VM403' THEN
      NULL;
  END;

  IF has_table_privilege('anon', 'public.empresas', 'SELECT')
     OR has_function_privilege('anon', 'app.pode(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'app.modulo_ativo(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tem privilégio nas tabelas ou funções novas';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'empresas', 'modulos', 'empresa_modulos', 'empresa_modulos_historico',
        'permissoes', 'cargos', 'cargo_permissoes', 'plataforma_usuarios', 'migracoes_aplicadas'
      )
      AND c.relrowsecurity IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'RLS desligado em alguma tabela nova';
  END IF;

  IF (
    SELECT count(*) FROM public.empresa_modulos
    WHERE empresa_id = v_empresa AND ativo
  ) <> 8 THEN
    RAISE EXCEPTION 'A empresa 1 precisa dos 8 módulos ativos (núcleo + 7 manifestos)';
  END IF;

  IF to_regclass('public.cargo_permissoes_permissao_idx') IS NULL
     OR to_regclass('public.empresa_modulos_modulo_idx') IS NULL THEN
    RAISE EXCEPTION 'Faltam os índices das FKs cargo_permissoes(permissao_id) e empresa_modulos(modulo_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'migracoes_aplicadas'
      AND p.polname = 'migracoes_aplicadas_nega'
      AND pg_get_expr(p.polqual, p.polrelid) = 'false'
  ) THEN
    RAISE EXCEPTION 'migracoes_aplicadas precisa da policy que nega com USING (false)';
  END IF;
END $$;

SELECT 'testes_0002 ok' AS resultado;
