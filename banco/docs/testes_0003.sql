-- =============================================================================
-- testes_0003.sql — conferência da etapa 4, só leitura.
-- Rode depois da 0003, como o papel que aplicou a migração:
--   psql -1 -v ON_ERROR_STOP=1 -f banco/docs/testes_0003.sql
-- Não há INSERT, UPDATE, DELETE nem DDL. O bloco só faz SELECT e ASSERT.
--
-- Cobre: backfill sem nulo, unicidade por empresa, resolver_login com e sem
-- empresa, qr_equipamento só por id, e o bloqueio VM403.
-- Com uma segunda empresa de teste (código OUTRA, mesma matrícula e mesma tag),
-- confere que o login e a tag se separam. Sem essa empresa, essa parte é pulada.
-- =============================================================================

DO $$
DECLARE
  v_empresa uuid := '00000000-0000-0000-0000-000000000001';
  v_tabelas text[] := ARRAY[
    'admin_auditoria', 'apontamentos_os', 'configuracoes_sistema', 'diario_horimetro',
    'diesel_abastecimentos', 'diesel_carregamentos', 'diesel_estoque_diario', 'diesel_tanques',
    'equipamentos', 'equipamentos_historico', 'execucoes_preventiva', 'itens_os_estoque',
    'lotes_estoque', 'movimentacoes_almoxarifado', 'notas_fora_do_custo', 'obras',
    'ordens_servico', 'os_pecas_previstas', 'pecas_estoque', 'perfis_usuarios',
    'planos_preventiva', 'preventiva_estrategias', 'preventiva_lista_materiais',
    'preventiva_lista_tarefas', 'preventiva_listas', 'preventiva_pacotes', 'servicos_almoxarifado'
  ];
  t text;
  v_nulos bigint;
  v_def text;
  v_email text;
  v_email_outra text;
  r record;
  v_id uuid;
  v_qr jsonb;
  v_rpc text;
BEGIN
  FOREACH t IN ARRAY v_tabelas LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Tabela ausente na conferência: %', t;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE empresa_id IS NULL', t) INTO v_nulos;
    IF v_nulos <> 0 THEN
      RAISE EXCEPTION 'Backfill incompleto em %: % linha(s) sem empresa', t, v_nulos;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND a.attname = 'empresa_id' AND a.attnotnull
    ) THEN
      RAISE EXCEPTION '% .empresa_id não está NOT NULL', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = ('public.' || t)::regclass
        AND contype = 'f'
        AND conname = t || '_empresa_id_fkey'
    ) THEN
      RAISE EXCEPTION '% sem FK de empresa_id', t;
    END IF;
    IF to_regclass('public.' || t || '_empresa_id_idx') IS NULL THEN
      RAISE EXCEPTION '% sem índice de empresa_id', t;
    END IF;
    SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_def
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = ('public.' || t)::regclass AND a.attname = 'empresa_id';
    IF v_def IS NULL OR position('empresa_atual' in v_def) = 0 THEN
      RAISE EXCEPTION '% .empresa_id sem default app.empresa_atual()', t;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.equipamentos'::regclass AND contype = 'u'
      AND replace(pg_get_constraintdef(oid), ' ', '') = 'UNIQUE(tag)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.equipamentos'::regclass AND contype = 'u'
      AND replace(pg_get_constraintdef(oid), ' ', '') = 'UNIQUE(empresa_id,tag)'
  ) THEN
    RAISE EXCEPTION 'A tag do equipamento precisa ser única por empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.perfis_usuarios'::regclass AND contype = 'u'
      AND replace(pg_get_constraintdef(oid), ' ', '') = 'UNIQUE(empresa_id,matricula)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.obras'::regclass AND contype = 'u'
      AND replace(pg_get_constraintdef(oid), ' ', '') = 'UNIQUE(empresa_id,codigo)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ordens_servico'::regclass AND contype = 'u'
      AND replace(pg_get_constraintdef(oid), ' ', '') = 'UNIQUE(empresa_id,numero_os)'
  ) THEN
    RAISE EXCEPTION 'Falta unicidade por empresa em matrícula, código da obra ou número da OS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.configuracoes_sistema c
    JOIN public.empresa_modulos em ON em.empresa_id = c.empresa_id AND em.modulo_id = 'frota'
    WHERE c.empresa_id = v_empresa
      AND (
        (em.config->>'limite_salto_horas')::numeric IS DISTINCT FROM c.limite_salto_horas
        OR (em.config->>'limite_salto_km')::numeric IS DISTINCT FROM c.limite_salto_km
        OR (em.config->>'limite_km_dia')::numeric IS DISTINCT FROM c.limite_km_dia
        OR (em.config->>'tolerancia_horas')::numeric IS DISTINCT FROM c.tolerancia_horas
      )
  ) THEN
    RAISE EXCEPTION 'A config do módulo frota não copiou os limites de configuracoes_sistema';
  END IF;

  IF public.resolver_login('___nao_existe___') IS NOT NULL
     OR public.resolver_login('___nao_existe___', NULL) IS NOT NULL
     OR public.resolver_login('___nao_existe___', 'VILASA') IS NOT NULL
     OR public.resolver_login('___nao_existe___', 'SEM-EMPRESA') IS NOT NULL THEN
    RAISE EXCEPTION 'resolver_login devolveu e-mail para um texto que não existe';
  END IF;

  FOR r IN
    SELECT p.matricula, p.email_login
    FROM public.perfis_usuarios p
    WHERE p.empresa_id = v_empresa
      AND coalesce(p.ativo, true)
      AND p.auth_user_id IS NOT NULL
      AND p.email_login IS NOT NULL
      AND (
        SELECT count(*) FROM public.perfis_usuarios q
        WHERE q.empresa_id = v_empresa
          AND coalesce(q.ativo, true)
          AND lower(btrim(q.matricula)) = lower(btrim(p.matricula))
      ) = 1
  LOOP
    v_email := public.resolver_login(r.matricula);
    IF v_email IS DISTINCT FROM r.email_login
       OR public.resolver_login(r.matricula, NULL) IS DISTINCT FROM r.email_login
       OR public.resolver_login(r.matricula, 'VILASA') IS DISTINCT FROM r.email_login THEN
      RAISE EXCEPTION 'resolver_login sem empresa não caiu na empresa 1 para a matrícula %', r.matricula;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.empresas WHERE upper(codigo) = 'OUTRA' AND ativa) THEN
    SELECT p.email_login INTO v_email
    FROM public.perfis_usuarios p
    JOIN public.empresas e ON e.id = p.empresa_id
    WHERE e.codigo = 'VILASA' AND p.matricula = '100' AND p.email_login IS NOT NULL;
    SELECT p.email_login INTO v_email_outra
    FROM public.perfis_usuarios p
    JOIN public.empresas e ON e.id = p.empresa_id
    WHERE upper(e.codigo) = 'OUTRA' AND p.matricula = '100' AND p.email_login IS NOT NULL;
    IF v_email IS NOT NULL AND v_email_outra IS NOT NULL THEN
      IF v_email = v_email_outra
         OR public.resolver_login('100') IS DISTINCT FROM v_email
         OR public.resolver_login('100', 'OUTRA') IS DISTINCT FROM v_email_outra THEN
        RAISE EXCEPTION 'A mesma matrícula em duas empresas não separou o e-mail';
      END IF;
    END IF;
  END IF;

  IF public.qr_equipamento(NULL, 'CB-05') IS NOT NULL THEN
    RAISE EXCEPTION 'qr_equipamento aceitou busca só por tag';
  END IF;

  FOR r IN
    SELECT id, tag FROM public.equipamentos
  LOOP
    v_qr := public.qr_equipamento(r.id, 'TAG-QUE-NAO-ESCOLHE');
    IF v_qr IS NULL OR (v_qr->>'id')::uuid IS DISTINCT FROM r.id THEN
      RAISE EXCEPTION 'qr_equipamento não achou a máquina % pelo id', r.id;
    END IF;
    IF public.qr_equipamento(NULL, r.tag) IS NOT NULL THEN
      RAISE EXCEPTION 'qr_equipamento ainda resolve a tag %', r.tag;
    END IF;
  END LOOP;

  SELECT id INTO v_id FROM public.equipamentos WHERE empresa_id = v_empresa LIMIT 1;
  IF v_id IS NOT NULL THEN
    v_qr := public.qr_equipamento(v_id);
    IF v_qr IS NULL OR (v_qr->'cfg'->>'limite_km_dia') IS NULL THEN
      RAISE EXCEPTION 'qr_equipamento não devolveu o limite da config do módulo';
    END IF;
  END IF;

  FOREACH v_rpc IN ARRAY ARRAY[
    'public.admin_definir_ativo(uuid, boolean)',
    'public.admin_salvar_usuario(uuid, text, text, text, jsonb, jsonb, boolean)',
    'public.almox_movimentar(jsonb)',
    'public.corrigir_leitura(uuid, uuid, text, numeric, text)',
    'public.diesel_sincronizar_leituras()',
    'public.diesel_vincular_equipamentos()',
    'public.importar_leituras(jsonb)',
    'public.os_assumir(uuid, text)',
    'public.preventiva_gerar_os(uuid)',
    'public.recalcular_horimetro_atual()'
  ] LOOP
    v_def := pg_get_functiondef(v_rpc::regprocedure);
    IF position('app.exigir' in v_def) = 0 THEN
      RAISE EXCEPTION '% não chama app.exigir', v_rpc;
    END IF;
  END LOOP;

  v_def := pg_get_functiondef('public.lancar_horimetro(uuid, numeric, text, timestamptz, uuid)'::regprocedure);
  IF position('app.exigir' in v_def) <> 0 OR position('empresa_id' in v_def) = 0 THEN
    RAISE EXCEPTION 'lancar_horimetro deve gravar a empresa da máquina e seguir anônimo';
  END IF;
  v_def := pg_get_functiondef('public.qr_equipamento(uuid, text)'::regprocedure);
  IF position('upper(e.tag)' in lower(v_def)) <> 0 OR position('p_id is null' in lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'qr_equipamento ainda procura por tag';
  END IF;
  v_def := pg_get_functiondef('app.validar_empresa_modulos()'::regprocedure);
  IF position('plataforma_usuarios' in v_def) = 0 THEN
    RAISE EXCEPTION 'O admin da empresa ainda pode ligar módulo: falta o recorte de plataforma';
  END IF;

  BEGIN
    PERFORM app.exigir('os.abrir');
    RAISE EXCEPTION 'app.exigir não falhou sem sessão';
  EXCEPTION
    WHEN SQLSTATE 'VM403' THEN NULL;
  END;

  FOR r IN
    SELECT auth_user_id
    FROM public.perfis_usuarios
    WHERE empresa_id = v_empresa
      AND coalesce(ativo, true)
      AND auth_user_id IS NOT NULL
      AND NOT (cargos_lista ? 'admin')
    LIMIT 1
  LOOP
    PERFORM set_config('request.jwt.claim.sub', r.auth_user_id::text, true);
    BEGIN
      PERFORM app.exigir('admin.usuarios');
      RAISE EXCEPTION 'Um perfil sem admin passou em admin.usuarios';
    EXCEPTION
      WHEN SQLSTATE 'VM403' THEN NULL;
    END;
  END LOOP;

  FOR r IN
    SELECT auth_user_id
    FROM public.perfis_usuarios
    WHERE empresa_id = v_empresa
      AND coalesce(ativo, true)
      AND auth_user_id IS NOT NULL
      AND cargos_lista ? 'admin'
    LIMIT 1
  LOOP
    PERFORM set_config('request.jwt.claim.sub', r.auth_user_id::text, true);
    PERFORM app.exigir('admin.usuarios');
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

SELECT 'testes_0003 ok' AS resultado;
