-- =============================================================================
-- testes_0004.sql — conferência da etapa 5, só leitura.
-- Rode depois da 0004, como o papel que aplicou a migração:
--   psql -1 -v ON_ERROR_STOP=1 -f banco/docs/testes_0004.sql
-- Não há INSERT, UPDATE, DELETE nem DDL. O bloco só faz SELECT e ASSERT.
--
-- Cobre: obras virou view com o mesmo id, locais e níveis, app.local_ok,
-- tipos a partir da unidade, colunas novas e a view ativos.
-- Com perfil e com obra na base, também simula o JWT e confere o acesso.
-- =============================================================================

DO $$
DECLARE
  v_empresa uuid := '00000000-0000-0000-0000-000000000001';
  v_kind "char";
  v_opts text[];
  v_def text;
  r record;
  v_auth uuid;
  v_local uuid;
  v_outro uuid;
  v_filho uuid;
  v_tag text;
BEGIN
  SELECT c.relkind, c.reloptions INTO v_kind, v_opts
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'obras';
  IF v_kind IS DISTINCT FROM 'v' THEN
    RAISE EXCEPTION 'public.obras precisa ser view';
  END IF;
  IF v_opts IS NULL OR NOT ('security_invoker=true' = ANY (v_opts)) THEN
    RAISE EXCEPTION 'a view obras não está com security_invoker';
  END IF;

  IF to_regclass('public.obras_base') IS NULL THEN
    RAISE EXCEPTION 'a tabela obras_base sumiu';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'obras_base' AND p.polname = 'obras_autenticado_ativo'
  ) THEN
    RAISE EXCEPTION 'a policy obras_autenticado_ativo não está mais em obras_base';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.obras_base b
    FULL JOIN (
      SELECT * FROM public.locais WHERE nivel = 1 AND pai_id IS NULL
    ) l ON l.id = b.id
    WHERE l.id IS NULL
       OR b.id IS NULL
       OR l.codigo IS DISTINCT FROM b.codigo
       OR l.nome IS DISTINCT FROM b.nome
       OR l.ativo IS DISTINCT FROM b.ativa
       OR l.empresa_id IS DISTINCT FROM b.empresa_id
       OR l.caminho IS DISTINCT FROM '/' || b.id::text || '/'
  ) THEN
    RAISE EXCEPTION 'locais de nível 1 não espelha obras_base com o mesmo id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.obras o
    FULL JOIN (
      SELECT * FROM public.locais WHERE nivel = 1 AND pai_id IS NULL
    ) l ON l.id = o.id
    WHERE o.id IS NULL
       OR l.id IS NULL
       OR o.codigo IS DISTINCT FROM l.codigo
       OR o.ativa IS DISTINCT FROM l.ativo
  ) THEN
    RAISE EXCEPTION 'a view obras não devolve o local de nível 1';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'obras'
      AND column_name IN ('id', 'codigo', 'nome', 'ativa', 'empresa_id')
    HAVING count(*) = 5
  ) THEN
    RAISE EXCEPTION 'a view obras não tem as colunas que o front usa';
  END IF;

  IF (
    SELECT termos->>'local.nivel1' FROM public.empresas WHERE id = v_empresa
  ) IS DISTINCT FROM (
    SELECT termo FROM public.locais_niveis WHERE empresa_id = v_empresa AND nivel = 1
  ) OR (
    SELECT termos->>'local.nivel1' FROM public.empresas WHERE id = v_empresa
  ) IS NULL THEN
    RAISE EXCEPTION 'o termo do nível 1 da empresa 1 não ficou em locais_niveis';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tipos_ativo
    WHERE empresa_id = v_empresa AND codigo = 'MAQUINA_PESADA' AND categoria = 'maquina_pesada'
      AND nome = 'Máquina pesada (H)'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tipos_ativo
    WHERE empresa_id = v_empresa AND codigo = 'VEICULO' AND categoria = 'veiculo'
      AND nome = 'Veículo (KM)'
  ) THEN
    RAISE EXCEPTION 'faltou o tipo Máquina pesada (H) ou Veículo (KM)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.equipamentos eq
    JOIN public.tipos_ativo t ON t.id = eq.tipo_ativo_id
    WHERE eq.empresa_id = v_empresa
      AND (
        (upper(btrim(coalesce(eq.unidade_medida, 'H'))) IN ('', 'H') AND t.codigo IS DISTINCT FROM 'MAQUINA_PESADA')
        OR (upper(btrim(eq.unidade_medida)) = 'KM' AND t.codigo IS DISTINCT FROM 'VEICULO')
      )
  ) THEN
    RAISE EXCEPTION 'o tipo do equipamento não seguiu a unidade de medida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.equipamentos
    WHERE empresa_id = v_empresa
      AND obra_id IS NOT NULL
      AND local_id IS DISTINCT FROM obra_id
      AND EXISTS (SELECT 1 FROM public.locais l WHERE l.id = obra_id AND l.nivel = 1)
  ) THEN
    RAISE EXCEPTION 'local_id não herdou o id da obra';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.equipamentos'::regclass
      AND attname = 'atributos'
      AND NOT attisdropped
      AND attnotnull
  ) THEN
    RAISE EXCEPTION 'equipamentos.atributos não está NOT NULL';
  END IF;

  SELECT c.relkind, c.reloptions INTO v_kind, v_opts
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'ativos';
  IF v_kind IS DISTINCT FROM 'v'
     OR v_opts IS NULL
     OR NOT ('security_invoker=true' = ANY (v_opts)) THEN
    RAISE EXCEPTION 'a view ativos não está com security_invoker';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.equipamentos eq
    JOIN public.ativos a ON a.id = eq.id
    WHERE eq.tag IS DISTINCT FROM a.tag
       OR eq.tipo_ativo_id IS DISTINCT FROM a.tipo_ativo_id
       OR eq.local_id IS DISTINCT FROM a.local_id
       OR eq.atributos IS DISTINCT FROM a.atributos
  ) THEN
    RAISE EXCEPTION 'a view ativos não reflete o equipamento';
  END IF;

  SELECT pg_get_functiondef('app.local_ok(uuid)'::regprocedure) INTO v_def;
  IF position('security definer' in lower(v_def)) = 0
     OR position('search_path' in lower(v_def)) = 0
     OR position('app.pode' in v_def) = 0 THEN
    RAISE EXCEPTION 'app.local_ok precisa ser security definer, com search_path e app.pode';
  END IF;
  IF position('app.local_ok' in pg_get_functiondef('app.obra_ok(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'app.obra_ok não delega para app.local_ok';
  END IF;

  IF has_table_privilege('anon', 'public.locais', 'SELECT')
     OR has_table_privilege('anon', 'public.obras', 'SELECT')
     OR has_table_privilege('anon', 'public.ativos', 'SELECT')
     OR has_table_privilege('anon', 'public.tipos_ativo', 'SELECT')
     OR has_function_privilege('anon', 'app.local_ok(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'app.pode(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon enxerga locais, ativos ou app.local_ok';
  END IF;

  SELECT id INTO v_local
  FROM public.locais
  WHERE empresa_id = v_empresa AND nivel = 1
  ORDER BY codigo
  LIMIT 1;

  SELECT p.auth_user_id INTO v_auth
  FROM public.perfis_usuarios p
  WHERE p.empresa_id = v_empresa
    AND coalesce(p.ativo, true)
    AND p.auth_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(coalesce(p.cargos_lista, '[]'::jsonb)) c
      WHERE lower(btrim(c)) = 'mecanico'
    )
  ORDER BY p.matricula
  LIMIT 1;

  IF v_auth IS NOT NULL AND v_local IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_auth::text, true);
    IF app.local_ok(NULL) IS NOT TRUE THEN
      RAISE EXCEPTION 'local nulo deveria passar para perfil ativo';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.perfis_usuarios p
      WHERE p.auth_user_id = v_auth
        AND (
          p.obras_permitidas IS NULL
          OR p.obras_permitidas = '[]'::jsonb
          OR p.obras_permitidas @> to_jsonb(ARRAY['TODAS']::text[])
          OR p.obras_permitidas @> to_jsonb(ARRAY[v_local::text])
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(p.obras_permitidas) o
            JOIN public.locais l ON l.id = v_local AND o = l.codigo
          )
        )
    ) THEN
      IF app.local_ok(v_local) THEN
        RAISE EXCEPTION 'mecânico sem a obra na lista passou em app.local_ok';
      END IF;
    ELSE
      IF app.local_ok(v_local) IS NOT TRUE OR app.obra_ok(v_local) IS NOT TRUE THEN
        RAISE EXCEPTION 'mecânico com a obra liberada não passou em app.local_ok';
      END IF;
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;

  SELECT p.auth_user_id INTO v_auth
  FROM public.perfis_usuarios p
  WHERE p.empresa_id = v_empresa
    AND coalesce(p.ativo, true)
    AND p.auth_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(coalesce(p.cargos_lista, '[]'::jsonb)) c
      WHERE lower(btrim(c)) IN ('admin', 'engenheiro', 'gestor')
    )
  LIMIT 1;

  IF v_auth IS NOT NULL AND v_local IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_auth::text, true);
    IF app.local_ok(v_local) IS NOT TRUE THEN
      RAISE EXCEPTION 'admin, engenheiro ou gestor não viu o local da própria empresa';
    END IF;
    SELECT l.id INTO v_outro
    FROM public.locais l
    WHERE l.empresa_id IS DISTINCT FROM v_empresa
    LIMIT 1;
    IF v_outro IS NOT NULL AND app.local_ok(v_outro) THEN
      RAISE EXCEPTION 'app.local_ok aceitou local de outra empresa';
    END IF;
    SELECT f.id INTO v_filho
    FROM public.locais f
    WHERE f.empresa_id = v_empresa AND f.nivel > 1
    LIMIT 1;
    IF v_filho IS NOT NULL AND app.local_ok(v_filho) IS NOT TRUE THEN
      RAISE EXCEPTION 'quem vê todas as obras não viu o local filho';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF app.local_ok(v_local) THEN
    RAISE EXCEPTION 'sem sessão, app.local_ok passou';
  END IF;

  SELECT eq.tag INTO v_tag
  FROM public.equipamentos eq
  JOIN public.ativos a ON a.id = eq.id
  WHERE eq.empresa_id = v_empresa
    AND upper(btrim(coalesce(eq.unidade_medida, 'H'))) = 'KM'
  LIMIT 1;
  IF v_tag IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.ativos a
    WHERE a.tag = v_tag AND a.tipo_codigo = 'VEICULO'
  ) THEN
    RAISE EXCEPTION 'o ativo em KM não apareceu como Veículo na view';
  END IF;

  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.equipamentos'::regclass
      AND contype = 'f'
      AND conname IN ('equipamentos_obra_id_fkey', 'equipamentos_local_id_fkey', 'equipamentos_tipo_ativo_id_fkey')
  LOOP
    NULL;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipamentos_obra_id_fkey' AND conrelid = 'public.equipamentos'::regclass
  ) THEN
    RAISE EXCEPTION 'a FK antiga de obra_id sumiu';
  END IF;
END $$;
