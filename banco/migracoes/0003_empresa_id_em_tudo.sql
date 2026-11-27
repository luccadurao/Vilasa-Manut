-- =============================================================================
-- 0003_empresa_id_em_tudo.sql — Vilasa-Manut
-- Etapa 4: empresa_id nas tabelas de negócio, login por empresa e QR só por id.
-- Pré-requisito: 0000, 0001 e 0002. Idempotente. Uma transação:
--   psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
-- Reversão: banco/migracoes/reverter/0003_empresa_id_em_tudo_reverter.sql
--
-- Não dá DROP de tabela, coluna, usuário nem policy.
-- Os únicos drops são de objeto que esta etapa substitui no mesmo arquivo:
--   * DROP FUNCTION public.resolver_login(text), para a assinatura ganhar
--     p_empresa com default. O cliente antigo, que manda só p_texto, continua
--     chamando a função e cai na empresa 1.
--   * DROP CONSTRAINT das unicidades globais de chave natural (tag, matrícula,
--     código, fonte+chave externa). No lugar entra a mesma regra por empresa.
-- id_interno de pecas_estoque não tinha unicidade; esta etapa não inventa uma.
-- O número da OS continua na sequence global e passa a ser único por empresa.
--
-- RPCs security definer de negócio chamam app.exigir com a permissão do módulo.
-- Ficam de fora, de propósito: resolver_login e meu_perfil (ainda não há, ou
-- é o próprio perfil), qr_equipamento e lancar_horimetro (portal anônimo; a
-- empresa sai da máquina), triggers e o event trigger rls_auto_enable.
-- preventiva_gerar_os sem sessão (dono do banco) continua gerando, carimbando
-- a empresa de cada plano. Com sessão, exige preventivas.gerar_os.
-- Ligar ou desligar módulo, com JWT, só passa se a pessoa está em
-- plataforma_usuarios. O admin da empresa não. Migração sem JWT segue livre.
-- =============================================================================
SET search_path = '';

DO $$ BEGIN
  IF to_regclass('public.empresas') IS NULL
     OR to_regprocedure('app.empresa_atual()') IS NULL
     OR to_regprocedure('app.exigir(text)') IS NULL THEN
    RAISE EXCEPTION 'Esquema inesperado: aplique a 0000, a 0001 e a 0002 antes da 0003';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- empresa_id: coluna, backfill da empresa 1, not null, default, FK e índice.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'admin_auditoria', 'apontamentos_os', 'configuracoes_sistema', 'diario_horimetro',
    'diesel_abastecimentos', 'diesel_carregamentos', 'diesel_estoque_diario', 'diesel_tanques',
    'equipamentos', 'equipamentos_historico', 'execucoes_preventiva', 'itens_os_estoque',
    'lotes_estoque', 'movimentacoes_almoxarifado', 'notas_fora_do_custo', 'obras',
    'ordens_servico', 'os_pecas_previstas', 'pecas_estoque', 'perfis_usuarios',
    'planos_preventiva', 'preventiva_estrategias', 'preventiva_lista_materiais',
    'preventiva_lista_tarefas', 'preventiva_listas', 'preventiva_pacotes', 'servicos_almoxarifado'
  ];
  empresa uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Tabela de negócio ausente: public.%', t;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_id uuid', t);
    EXECUTE format(
      'UPDATE public.%I SET empresa_id = %L::uuid WHERE empresa_id IS NULL',
      t, empresa
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN empresa_id SET NOT NULL', t);
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN empresa_id SET DEFAULT app.empresa_atual()',
      t
    );
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_empresa_id_fkey' AND conrelid = ('public.' || t)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (empresa_id) REFERENCES public.empresas(id)',
        t, t || '_empresa_id_fkey'
      );
    END IF;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (empresa_id)',
      t || '_empresa_id_idx', t
    );
  END LOOP;
END $$;

-- A empresa da sessão passa a ser a do perfil. Sem perfil ativo, devolve null
-- (o anônimo não herda a empresa 1 no default).
CREATE OR REPLACE FUNCTION app.empresa_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.empresa_id
  FROM public.perfis_usuarios p
  WHERE p.auth_user_id = auth.uid()
    AND coalesce(p.ativo, true)
  LIMIT 1
$function$;

-- ---------------------------------------------------------------------------
-- Unicidades de chave natural passam a valer por empresa.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  alvo record;
  nome text;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('public.equipamentos', 'UNIQUE (tag)', 'equipamentos_empresa_tag_key', 'UNIQUE (empresa_id, tag)'),
      ('public.obras', 'UNIQUE (codigo)', 'obras_empresa_codigo_key', 'UNIQUE (empresa_id, codigo)'),
      ('public.perfis_usuarios', 'UNIQUE (matricula)', 'perfis_usuarios_empresa_matricula_key', 'UNIQUE (empresa_id, matricula)'),
      ('public.diesel_tanques', 'UNIQUE (codigo)', 'diesel_tanques_empresa_codigo_key', 'UNIQUE (empresa_id, codigo)'),
      ('public.preventiva_estrategias', 'UNIQUE (codigo)', 'preventiva_estrategias_empresa_codigo_key', 'UNIQUE (empresa_id, codigo)'),
      ('public.preventiva_listas', 'UNIQUE (codigo)', 'preventiva_listas_empresa_codigo_key', 'UNIQUE (empresa_id, codigo)'),
      ('public.diesel_abastecimentos', 'UNIQUE (fonte, chave_externa)', 'diesel_abastecimentos_empresa_fonte_chave_key', 'UNIQUE (empresa_id, fonte, chave_externa)'),
      ('public.diesel_carregamentos', 'UNIQUE (fonte, chave_externa)', 'diesel_carregamentos_empresa_fonte_chave_key', 'UNIQUE (empresa_id, fonte, chave_externa)')
    ) AS t(relacao, antigo, novo_nome, novo_def)
  LOOP
    FOR nome IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = alvo.relacao::regclass
        AND c.contype = 'u'
        AND replace(pg_get_constraintdef(c.oid), ' ', '') = replace(alvo.antigo, ' ', '')
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', alvo.relacao, nome);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = alvo.relacao::regclass
        AND c.contype = 'u'
        AND replace(pg_get_constraintdef(c.oid), ' ', '') = replace(alvo.novo_def, ' ', '')
    ) THEN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', alvo.relacao, alvo.novo_nome, alvo.novo_def);
    END IF;
  END LOOP;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.ordens_servico
    GROUP BY empresa_id, numero_os
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'numero_os repetido na mesma empresa; a unicidade não foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ordens_servico_empresa_numero_key'
      AND conrelid = 'public.ordens_servico'::regclass
  ) THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_empresa_numero_key UNIQUE (empresa_id, numero_os);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Limites de salto: cópia única para a config do módulo frota.
-- A tabela configuracoes_sistema continua legível. A leitura nova prefere o config.
-- ---------------------------------------------------------------------------
UPDATE public.empresa_modulos em
SET config = em.config || src.limites,
    config_versao = GREATEST(em.config_versao, 1)
FROM (
  SELECT DISTINCT ON (empresa_id)
    empresa_id,
    jsonb_build_object(
      'limite_salto_horas', limite_salto_horas,
      'limite_salto_km', limite_salto_km,
      'limite_km_dia', limite_km_dia,
      'tolerancia_horas', tolerancia_horas,
      'delta_maximo_horimetro', delta_maximo_horimetro
    ) AS limites
  FROM public.configuracoes_sistema
  ORDER BY empresa_id, id
) src
WHERE em.empresa_id = src.empresa_id
  AND em.modulo_id = 'frota'
  AND NOT (em.config ? 'limite_salto_horas');

CREATE OR REPLACE FUNCTION app.limites_medidor(p_empresa uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(
    (
      SELECT em.config
      FROM public.empresa_modulos em
      WHERE em.empresa_id = p_empresa
        AND em.modulo_id = 'frota'
        AND em.config ? 'limite_salto_horas'
      LIMIT 1
    ),
    (
      SELECT jsonb_build_object(
        'limite_salto_horas', c.limite_salto_horas,
        'limite_salto_km', c.limite_salto_km,
        'limite_km_dia', c.limite_km_dia,
        'tolerancia_horas', c.tolerancia_horas,
        'delta_maximo_horimetro', c.delta_maximo_horimetro
      )
      FROM public.configuracoes_sistema c
      WHERE c.empresa_id = p_empresa
      LIMIT 1
    ),
    jsonb_build_object(
      'limite_salto_horas', 300,
      'limite_salto_km', 5000,
      'limite_km_dia', 100,
      'tolerancia_horas', 0.5,
      'delta_maximo_horimetro', 24
    )
  )
$function$;

CREATE OR REPLACE FUNCTION app.limite_salto_da_empresa(
  p_un text,
  p_base timestamptz,
  p_quando timestamptz,
  p_empresa uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c jsonb := app.limites_medidor(coalesce(p_empresa, '00000000-0000-0000-0000-000000000001'::uuid));
  h numeric;
  km boolean := upper(coalesce(p_un, 'H')) = 'KM';
BEGIN
  IF p_base IS NULL THEN
    RETURN CASE WHEN km
      THEN coalesce((c->>'limite_salto_km')::numeric, 5000)
      ELSE coalesce((c->>'limite_salto_horas')::numeric, 300) END;
  END IF;
  h := greatest(0, extract(epoch FROM (least(coalesce(p_quando, now()), now()) - p_base)) / 3600.0);
  IF km THEN
    RETURN coalesce((c->>'limite_km_dia')::numeric, 100) * greatest(1, ceil(h / 24.0));
  END IF;
  RETURN h + coalesce((c->>'tolerancia_horas')::numeric, 0.5);
END
$function$;

CREATE OR REPLACE FUNCTION app.limite_salto(
  p_un text,
  p_base timestamptz,
  p_quando timestamptz DEFAULT now()
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN app.limite_salto_da_empresa(
    p_un,
    p_base,
    p_quando,
    coalesce(app.empresa_atual(), '00000000-0000-0000-0000-000000000001'::uuid)
  );
END
$function$;

-- Empresa 1 (VILASA) mantém slug@vilasa.invalid, que é a conta que já existe.
-- Outra empresa ganha slug@codigo.vilasa.invalid, para a matrícula poder repetir.
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

-- ---------------------------------------------------------------------------
-- Quem liga e desliga módulo, com usuário logado, é plataforma_usuarios.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.validar_empresa_modulos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_modulo public.modulos%ROWTYPE;
  v_faltam text[];
  v_dependentes text[];
  v_ativo boolean;
  v_id text;
  v_empresa uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.modulo_id;
    v_empresa := OLD.empresa_id;
    v_ativo := false;
  ELSE
    v_id := NEW.modulo_id;
    v_empresa := NEW.empresa_id;
    v_ativo := NEW.ativo;
  END IF;

  IF auth.uid() IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR TG_OP = 'DELETE'
       OR (TG_OP = 'UPDATE' AND OLD.ativo IS DISTINCT FROM NEW.ativo)
     ) AND NOT EXISTS (
       SELECT 1 FROM public.plataforma_usuarios pu WHERE pu.auth_user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'VM403: só o dono da plataforma liga e desliga módulos.'
      USING ERRCODE = 'VM403';
  END IF;

  SELECT * INTO v_modulo FROM public.modulos WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Módulo "%" não está no catálogo.', v_id USING ERRCODE = 'P0001';
  END IF;

  IF v_modulo.obrigatorio AND v_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'O módulo "%" é obrigatório e não pode ser desligado.', v_id USING ERRCODE = 'P0001';
  END IF;

  IF v_ativo IS TRUE THEN
    SELECT coalesce(array_agg(dep ORDER BY dep), ARRAY[]::text[])
      INTO v_faltam
      FROM unnest(coalesce(v_modulo.depende, ARRAY[]::text[])) AS dep
     WHERE NOT EXISTS (
       SELECT 1 FROM public.empresa_modulos em
       WHERE em.empresa_id = v_empresa
         AND em.modulo_id = dep
         AND em.ativo
         AND (em.inicio IS NULL OR em.inicio <= CURRENT_DATE)
         AND (em.valido_ate IS NULL OR em.valido_ate >= CURRENT_DATE)
     );
    IF cardinality(v_faltam) > 0 THEN
      RAISE EXCEPTION 'Não é possível ligar "%" sem as dependências ativas: %.',
        v_id, array_to_string(v_faltam, ', ') USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT coalesce(array_agg(em.modulo_id ORDER BY em.modulo_id), ARRAY[]::text[])
      INTO v_dependentes
      FROM public.empresa_modulos em
      JOIN public.modulos m ON m.id = em.modulo_id
     WHERE em.empresa_id = v_empresa
       AND em.ativo
       AND em.modulo_id <> v_id
       AND v_id = ANY (coalesce(m.depende, ARRAY[]::text[]));
    IF cardinality(v_dependentes) > 0 THEN
      RAISE EXCEPTION 'Não é possível desligar "%" porque estes módulos ativos dependem dele: %.',
        v_id, array_to_string(v_dependentes, ', ') USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

-- ---------------------------------------------------------------------------
-- Triggers que gravam filho copiam a empresa do pai.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.log_alteracao_equipamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE c text; v_old text; v_new text;
BEGIN
  FOREACH c IN ARRAY ARRAY['tag','nome','marca','modelo','numero_serie','placa','ano_fabricacao','propriedade','situacao_ciclo','unidade_medida','obra_id'] LOOP
    EXECUTE format('select ($1).%I::text, ($2).%I::text', c, c) INTO v_old, v_new USING old, new;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.equipamentos_historico
        (equipamento_id, campo, valor_antigo, valor_novo, alterado_por, empresa_id)
      VALUES (new.id, c, v_old, v_new, auth.uid(), new.empresa_id);
    END IF;
  END LOOP;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION app.log_saldo_peca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(current_setting('app.mov_ok', true), '') = '1' THEN RETURN new; END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(new.quantidade, 0) <> 0 THEN
      INSERT INTO public.movimentacoes_almoxarifado
        (obra_id, tipo_movimento, peca_id, descricao_item, quantidade, valor_unitario, motivo, saldo_apos, criado_por, empresa_id)
      VALUES (new.obra_id, 'SALDO_INICIAL', new.id, new.descricao, new.quantidade, coalesce(new.custo_unitario, 0),
              'CADASTRO DO ITEM COM SALDO', new.quantidade, auth.uid(), new.empresa_id);
    END IF;
  ELSIF new.quantidade IS DISTINCT FROM old.quantidade THEN
    INSERT INTO public.movimentacoes_almoxarifado
      (obra_id, tipo_movimento, peca_id, descricao_item, quantidade, valor_unitario, motivo, saldo_apos, criado_por, empresa_id)
    VALUES (new.obra_id, 'AJUSTE_INVENTARIO', new.id, new.descricao, coalesce(new.quantidade, 0) - coalesce(old.quantidade, 0),
            coalesce(new.custo_unitario, 0), 'EDIÇÃO MANUAL DO SALDO (' || coalesce(old.quantidade, 0) || ' → ' || coalesce(new.quantidade, 0) || ')',
            new.quantidade, auth.uid(), new.empresa_id);
  END IF;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION app.preventiva_ao_concluir()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_cont numeric;
BEGIN
  IF new.plano_id IS NULL OR new.status <> 'concluida' OR old.status = 'concluida' THEN RETURN new; END IF;
  SELECT coalesce(nullif(new.horimetro_os, 0), e.horimetro_atual) INTO v_cont
    FROM public.equipamentos e
   WHERE e.id = new.equipamento_id AND e.empresa_id = new.empresa_id;
  UPDATE public.planos_preventiva
     SET ultimo_horimetro_execucao = v_cont,
         ultima_data_execucao = coalesce(new.concluida_em, now())::date,
         ultimo_pacote_executado = new.pacote,
         ciclo_atual = greatest(ciclo_atual, coalesce(new.ciclo, 0)),
         os_aberta_id = NULL
   WHERE id = new.plano_id AND empresa_id = new.empresa_id;
  INSERT INTO public.execucoes_preventiva
    (plano_id, equipamento_id, pacote, status, parada_obrigatoria, data_entrada, data_conclusao,
     horimetro_execucao, mecanicos_nomes, observacoes, empresa_id)
  VALUES (new.plano_id, new.equipamento_id, new.pacote, 'concluida', true, new.aberta_em,
          coalesce(new.concluida_em, now()), v_cont, new.mecanico_nome, 'OS ' || new.numero_os, new.empresa_id);
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION app.pacote_do_ciclo(p_estrategia uuid, p_ciclo integer)
RETURNS public.preventiva_pacotes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT pk.*
  FROM public.preventiva_pacotes pk
  WHERE pk.estrategia_id = p_estrategia
    AND pk.empresa_id = (SELECT s.empresa_id FROM public.preventiva_estrategias s WHERE s.id = p_estrategia)
    AND p_ciclo % pk.multiplo = 0
  ORDER BY pk.multiplo DESC
  LIMIT 1
$function$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_definir_ativo(p_id uuid, p_ativo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_auth uuid;
BEGIN
  PERFORM app.exigir('admin.usuarios');
  UPDATE public.perfis_usuarios
     SET ativo = coalesce(p_ativo, true)
   WHERE id = p_id AND empresa_id = app.empresa_atual()
  RETURNING auth_user_id INTO v_auth;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF v_auth IS NOT NULL THEN
    UPDATE auth.users
       SET banned_until = CASE WHEN coalesce(p_ativo, true) THEN NULL ELSE 'infinity'::timestamptz END
     WHERE id = v_auth;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_salvar_usuario(
  p_id uuid, p_matricula text, p_nome text, p_senha text, p_cargos jsonb, p_obras jsonb, p_ativo boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mat text := upper(btrim(coalesce(p_matricula, '')));
  v_nome text := upper(btrim(coalesce(p_nome, '')));
  v_senha text := btrim(coalesce(p_senha, ''));
  v_obras jsonb := CASE WHEN p_obras IS NULL OR jsonb_typeof(p_obras) <> 'array' OR jsonb_array_length(p_obras) = 0
                        THEN '["TODAS"]'::jsonb ELSE p_obras END;
  v_email text; v_auth uuid; v_perfil uuid; v_email_atual text; v_codigo text;
  v_empresa uuid := app.empresa_atual();
BEGIN
  PERFORM app.exigir('admin.usuarios');
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'VM403: sem empresa na sessão.' USING ERRCODE = 'VM403';
  END IF;
  IF v_mat = '' OR v_nome = '' THEN RAISE EXCEPTION 'Informe o login e o nome.'; END IF;
  IF p_cargos IS NULL OR jsonb_typeof(p_cargos) <> 'array' OR jsonb_array_length(p_cargos) = 0 THEN
    RAISE EXCEPTION 'Marque pelo menos 1 cargo.';
  END IF;
  IF v_senha <> '' AND length(v_senha) < 6 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 6 caracteres.';
  END IF;
  SELECT codigo INTO v_codigo FROM public.empresas WHERE id = v_empresa;

  IF p_id IS NULL THEN
    IF v_senha = '' THEN RAISE EXCEPTION 'Informe uma senha para o novo usuário.'; END IF;
    v_email := app.email_interno(v_mat, v_codigo);
    IF v_email = app.dominio_login() THEN RAISE EXCEPTION 'Login inválido.'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.perfis_usuarios
      WHERE empresa_id = v_empresa AND upper(btrim(matricula)) = v_mat
    ) OR EXISTS (
      SELECT 1 FROM public.perfis_usuarios WHERE email_login = v_email
    ) THEN
      RAISE EXCEPTION 'Já existe um usuário com este login.';
    END IF;
    v_auth := app.criar_auth_user(v_email, v_senha);
    INSERT INTO public.perfis_usuarios
      (matricula, nome, senha_acesso, cargos_lista, obras_permitidas, ativo, auth_user_id, email_login, empresa_id)
    VALUES (v_mat, v_nome, '!auth', p_cargos, v_obras, coalesce(p_ativo, true), v_auth, v_email, v_empresa)
    RETURNING id INTO v_perfil;
    IF NOT coalesce(p_ativo, true) THEN
      UPDATE auth.users SET banned_until = 'infinity' WHERE id = v_auth;
    END IF;
    RETURN v_perfil;
  END IF;

  SELECT auth_user_id, email_login INTO v_auth, v_email_atual
  FROM public.perfis_usuarios
  WHERE id = p_id AND empresa_id = v_empresa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.perfis_usuarios
    WHERE empresa_id = v_empresa AND id <> p_id AND upper(btrim(matricula)) = v_mat
  ) THEN
    RAISE EXCEPTION 'Já existe um usuário com este login.';
  END IF;

  IF v_senha <> '' THEN
    IF v_auth IS NULL THEN
      v_email := coalesce(v_email_atual, app.email_interno(v_mat, v_codigo));
      v_auth := app.criar_auth_user(v_email, v_senha);
      UPDATE public.perfis_usuarios SET auth_user_id = v_auth, email_login = v_email WHERE id = p_id;
    ELSE
      UPDATE auth.users
         SET encrypted_password = extensions.crypt(v_senha, extensions.gen_salt('bf')),
             updated_at = now()
       WHERE id = v_auth;
    END IF;
    UPDATE public.perfis_usuarios SET senha_acesso = '!auth' WHERE id = p_id;
  END IF;

  UPDATE public.perfis_usuarios
     SET matricula = v_mat, nome = v_nome, cargos_lista = p_cargos,
         obras_permitidas = v_obras, ativo = coalesce(p_ativo, true)
   WHERE id = p_id AND empresa_id = v_empresa;
  IF v_auth IS NOT NULL THEN
    UPDATE auth.users
       SET banned_until = CASE WHEN coalesce(p_ativo, true) THEN NULL ELSE 'infinity'::timestamptz END
     WHERE id = v_auth;
  END IF;
  RETURN p_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.almox_movimentar(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_tipo text := upper(btrim(coalesce(p->>'tipo', '')));
  v_qtd numeric := nullif(p->>'quantidade', '')::numeric;
  v_peca_id uuid := nullif(p->>'peca_id', '')::uuid;
  v_eq_id uuid := nullif(p->>'equipamento_id', '')::uuid;
  v_os_id uuid := nullif(p->>'os_id', '')::uuid;
  v_obra uuid := nullif(p->>'obra_id', '')::uuid;
  v_valor numeric := coalesce(nullif(p->>'valor_unitario', '')::numeric, 0);
  v_desc text := upper(btrim(coalesce(p->>'descricao_item', '')));
  v_nf text := upper(btrim(coalesce(p->>'numero_nf', '')));
  v_forn text := upper(btrim(coalesce(p->>'fornecedor', '')));
  v_quem text := upper(btrim(coalesce(p->>'retirado_por', '')));
  v_motivo text := btrim(coalesce(p->>'motivo', ''));
  v_obs text := btrim(coalesce(p->>'observacao', ''));
  v_cod text := upper(btrim(coalesce(p->>'codigo_nf', '')));
  v_quando timestamptz := least(coalesce(nullif(p->>'registrado_em', '')::timestamptz, now()), now());
  v_peca public.pecas_estoque%rowtype;
  v_eq public.equipamentos%rowtype;
  v_os public.ordens_servico%rowtype;
  v_saldo numeric; v_custo numeric; v_delta numeric; v_par jsonb; v_grava_qtd numeric;
  v_empresa uuid := app.empresa_atual();
BEGIN
  IF v_tipo IN ('ENTRADA_NF', 'NOTA_APLICADA') THEN
    PERFORM app.exigir('estoque.entrada');
  ELSIF v_tipo IN ('SAIDA_ESTOQUE', 'DEVOLUCAO') THEN
    PERFORM app.exigir('estoque.baixar');
  ELSIF v_tipo = 'AJUSTE_INVENTARIO' THEN
    PERFORM app.exigir('estoque.catalogo');
  ELSE
    PERFORM app.exigir('estoque.baixar');
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'VM403: sem empresa na sessão.' USING ERRCODE = 'VM403';
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimentacoes_almoxarifado WHERE id = v_id AND empresa_id = v_empresa) THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true);
  END IF;
  IF v_tipo NOT IN ('ENTRADA_NF', 'SAIDA_ESTOQUE', 'NOTA_APLICADA', 'DEVOLUCAO', 'AJUSTE_INVENTARIO') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: %', v_tipo USING ERRCODE = 'P0001';
  END IF;
  IF v_qtd IS NULL OR v_qtd < 0 OR (v_qtd = 0 AND v_tipo <> 'AJUSTE_INVENTARIO') THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA: informe a quantidade.' USING ERRCODE = 'P0001';
  END IF;

  IF v_eq_id IS NOT NULL THEN
    SELECT * INTO v_eq FROM public.equipamentos WHERE id = v_eq_id AND empresa_id = v_empresa;
    IF NOT FOUND THEN RAISE EXCEPTION 'EQUIPAMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0001'; END IF;
    IF NOT app.obra_ok(v_eq.obra_id) THEN RAISE EXCEPTION 'SEM_PERMISSAO: equipamento de outra obra.' USING ERRCODE = '42501'; END IF;
  END IF;
  IF v_os_id IS NOT NULL THEN
    SELECT * INTO v_os FROM public.ordens_servico WHERE id = v_os_id AND empresa_id = v_empresa;
    IF NOT FOUND THEN RAISE EXCEPTION 'OS_NAO_ENCONTRADA' USING ERRCODE = 'P0001'; END IF;
    IF v_eq_id IS NOT NULL AND v_os.equipamento_id IS DISTINCT FROM v_eq_id THEN
      RAISE EXCEPTION 'OS_DE_OUTRA_MAQUINA: a OS escolhida não é deste equipamento.' USING ERRCODE = 'P0001';
    END IF;
    IF v_eq_id IS NULL THEN v_eq_id := v_os.equipamento_id; END IF;
  END IF;
  IF v_tipo IN ('SAIDA_ESTOQUE', 'NOTA_APLICADA') AND v_eq_id IS NULL THEN
    RAISE EXCEPTION 'EQUIPAMENTO_OBRIGATORIO: informe a máquina (ou OFICINA).' USING ERRCODE = 'P0001';
  END IF;
  IF v_tipo IN ('SAIDA_ESTOQUE', 'NOTA_APLICADA') AND v_quem = '' THEN
    RAISE EXCEPTION 'QUEM_OBRIGATORIO: informe quem retirou / quem comprou.' USING ERRCODE = 'P0001';
  END IF;
  IF v_tipo IN ('ENTRADA_NF', 'NOTA_APLICADA') AND v_nf = '' THEN
    RAISE EXCEPTION 'NF_OBRIGATORIA: informe o número da nota.' USING ERRCODE = 'P0001';
  END IF;
  IF v_tipo = 'NOTA_APLICADA' AND v_desc = '' THEN
    RAISE EXCEPTION 'DESCRICAO_OBRIGATORIA: descreva o item da nota.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.mov_ok', '1', true);

  IF v_tipo IN ('ENTRADA_NF', 'SAIDA_ESTOQUE', 'DEVOLUCAO', 'AJUSTE_INVENTARIO') AND v_peca_id IS NOT NULL THEN
    SELECT * INTO v_peca FROM public.pecas_estoque WHERE id = v_peca_id AND empresa_id = v_empresa FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO' USING ERRCODE = 'P0001'; END IF;
    IF NOT app.obra_ok(v_peca.obra_id) THEN RAISE EXCEPTION 'SEM_PERMISSAO: item de outra obra.' USING ERRCODE = '42501'; END IF;
    v_saldo := coalesce(v_peca.quantidade, 0);
    v_custo := coalesce(v_peca.custo_unitario, 0);
    IF v_obra IS NULL THEN v_obra := v_peca.obra_id; END IF;
    IF v_desc = '' THEN v_desc := upper(v_peca.descricao); END IF;
  ELSIF v_tipo IN ('SAIDA_ESTOQUE', 'DEVOLUCAO', 'AJUSTE_INVENTARIO') THEN
    RAISE EXCEPTION 'ITEM_OBRIGATORIO: escolha o item do catálogo.' USING ERRCODE = 'P0001';
  END IF;
  IF v_obra IS NULL AND v_eq_id IS NOT NULL THEN v_obra := v_eq.obra_id; END IF;

  v_grava_qtd := v_qtd;
  IF v_tipo = 'ENTRADA_NF' THEN
    IF v_peca_id IS NOT NULL THEN
      IF v_valor > 0 THEN
        v_custo := CASE WHEN v_saldo + v_qtd > 0 AND v_saldo > 0
                        THEN round((v_saldo * v_custo + v_qtd * v_valor) / (v_saldo + v_qtd), 4) ELSE v_valor END;
      END IF;
      v_par := coalesce(v_peca.codigos_paralelos, '[]'::jsonb);
      IF v_cod <> '' AND NOT (v_par ? v_cod) THEN v_par := v_par || to_jsonb(v_cod); END IF;
      v_saldo := v_saldo + v_qtd;
      UPDATE public.pecas_estoque SET quantidade = v_saldo, custo_unitario = v_custo, codigos_paralelos = v_par
       WHERE id = v_peca_id AND empresa_id = v_empresa;
    END IF;
  ELSIF v_tipo = 'SAIDA_ESTOQUE' THEN
    IF v_saldo < v_qtd THEN
      RAISE EXCEPTION 'SALDO_INSUFICIENTE: saldo de % é %, pedido %.', v_peca.id_interno, v_saldo, v_qtd USING ERRCODE = 'P0001';
    END IF;
    v_valor := v_custo;
    v_saldo := v_saldo - v_qtd;
    UPDATE public.pecas_estoque SET quantidade = v_saldo WHERE id = v_peca_id AND empresa_id = v_empresa;
  ELSIF v_tipo = 'DEVOLUCAO' THEN
    v_valor := v_custo;
    v_saldo := v_saldo + v_qtd;
    UPDATE public.pecas_estoque SET quantidade = v_saldo WHERE id = v_peca_id AND empresa_id = v_empresa;
  ELSIF v_tipo = 'AJUSTE_INVENTARIO' THEN
    IF v_motivo = '' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO: informe o motivo do ajuste.' USING ERRCODE = 'P0001'; END IF;
    v_delta := v_qtd - v_saldo;
    v_grava_qtd := v_delta;
    v_valor := v_custo;
    v_saldo := v_qtd;
    UPDATE public.pecas_estoque SET quantidade = v_saldo WHERE id = v_peca_id AND empresa_id = v_empresa;
  END IF;

  INSERT INTO public.movimentacoes_almoxarifado
    (id, obra_id, tipo_movimento, numero_nf, fornecedor, peca_id, descricao_item, quantidade, valor_unitario,
     equipamento_id, os_id, retirado_por, observacao, motivo, saldo_apos, criado_por, registrado_em, empresa_id)
  VALUES (v_id, v_obra, v_tipo, nullif(v_nf, ''), nullif(v_forn, ''), v_peca_id, v_desc, v_grava_qtd, v_valor,
          v_eq_id, v_os_id, nullif(v_quem, ''), nullif(v_obs, ''), nullif(v_motivo, ''), v_saldo, auth.uid(), v_quando, v_empresa);

  PERFORM set_config('app.mov_ok', '', true);
  RETURN jsonb_build_object('ok', true, 'saldo_apos', v_saldo, 'custo', v_custo);
END
$function$;

CREATE OR REPLACE FUNCTION public.corrigir_leitura(
  p_id uuid, p_equipamento uuid, p_medidor text, p_leitura numeric, p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eq public.equipamentos%rowtype;
  v_med text := upper(btrim(coalesce(p_medidor, '')));
  v_nome text;
  v_empresa uuid := app.empresa_atual();
BEGIN
  PERFORM app.exigir('frota.gerenciar');
  IF btrim(coalesce(p_motivo, '')) = '' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO: informe o motivo da correção.' USING ERRCODE = 'P0001'; END IF;
  IF p_leitura IS NULL OR p_leitura < 0 THEN RAISE EXCEPTION 'LEITURA_INVALIDA' USING ERRCODE = 'P0001'; END IF;
  IF v_med NOT IN ('H', 'KM') THEN RAISE EXCEPTION 'MEDIDOR_INVALIDO' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.diario_horimetro WHERE id = p_id AND empresa_id = v_empresa) THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true);
  END IF;
  SELECT * INTO v_eq FROM public.equipamentos WHERE id = p_equipamento AND empresa_id = v_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EQUIPAMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0001'; END IF;
  IF NOT app.obra_ok(v_eq.obra_id) THEN RAISE EXCEPTION 'SEM_PERMISSAO: equipamento de outra obra.' USING ERRCODE = '42501'; END IF;
  SELECT nome INTO v_nome FROM public.perfis_usuarios WHERE auth_user_id = auth.uid() AND empresa_id = v_empresa;
  IF v_med = upper(coalesce(v_eq.unidade_medida, 'H')) THEN
    UPDATE public.equipamentos SET horimetro_atual = p_leitura, horimetro_atualizado_em = now()
     WHERE id = p_equipamento AND empresa_id = v_empresa;
  ELSE
    UPDATE public.equipamentos SET km_atual = p_leitura, km_atualizado_em = now()
     WHERE id = p_equipamento AND empresa_id = v_empresa;
  END IF;
  INSERT INTO public.diario_horimetro
    (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, origem, motivo, empresa_id)
  VALUES (p_id, p_equipamento, p_leitura, 'CORREÇÃO: ' || coalesce(v_nome, 'PCM'), now(), v_med, 'correcao', btrim(p_motivo), v_empresa);
  RETURN jsonb_build_object('ok', true);
END
$function$;

CREATE OR REPLACE FUNCTION public.diesel_sincronizar_leituras()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record; v_med text; v_leit numeric; v_prev numeric; v_prev_t timestamptz; v_next numeric;
  v_quando timestamptz; v_un text; v_id uuid; v_ok int := 0; v_rej int := 0; v_dup int := 0; v_n int;
  v_empresa uuid := app.empresa_atual();
BEGIN
  PERFORM app.exigir('diesel.gerenciar');
  FOR r IN
    SELECT a.id, a.equipamento_id, a.data, a.hora, a.horimetro, a.odometro, a.empresa_id, e.unidade_medida
    FROM public.diesel_abastecimentos a
    JOIN public.equipamentos e ON e.id = a.equipamento_id AND e.empresa_id = a.empresa_id
    WHERE a.empresa_id = v_empresa
      AND a.fonte = 'cta' AND NOT a.suspeito AND NOT a.transferencia
      AND (coalesce(a.horimetro, 0) > 0 OR coalesce(a.odometro, 0) > 0)
    ORDER BY a.equipamento_id, a.data, a.hora
  LOOP
    FOR v_med, v_leit IN SELECT * FROM (VALUES ('H', r.horimetro), ('KM', r.odometro)) t(m, l) WHERE coalesce(l, 0) > 0 LOOP
      v_id := md5('cta|' || r.id::text || '|' || v_med)::uuid;
      IF EXISTS (SELECT 1 FROM public.diario_horimetro WHERE id = v_id) THEN v_dup := v_dup + 1; CONTINUE; END IF;
      v_quando := least(((r.data::text || ' ' || coalesce(r.hora::text, '12:00:00')) || '-03')::timestamptz, now());
      SELECT leitura, registrado_em INTO v_prev, v_prev_t FROM public.diario_horimetro
        WHERE equipamento_id = r.equipamento_id AND empresa_id = r.empresa_id AND medidor = v_med AND registrado_em <= v_quando
        ORDER BY registrado_em DESC LIMIT 1;
      SELECT leitura INTO v_next FROM public.diario_horimetro
        WHERE equipamento_id = r.equipamento_id AND empresa_id = r.empresa_id AND medidor = v_med AND registrado_em > v_quando
        ORDER BY registrado_em ASC LIMIT 1;
      v_un := CASE WHEN v_med = 'KM' THEN 'KM' ELSE 'H' END;
      IF (v_prev IS NOT NULL AND v_leit < v_prev)
         OR (v_next IS NOT NULL AND v_leit > v_next)
         OR (v_prev IS NOT NULL AND (v_leit - v_prev) > app.limite_salto_da_empresa(v_un, v_prev_t, v_quando, r.empresa_id)) THEN
        v_rej := v_rej + 1; CONTINUE;
      END IF;
      INSERT INTO public.diario_horimetro
        (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, origem, empresa_id)
      VALUES (v_id, r.equipamento_id, v_leit, 'CTA DIESEL', v_quando, v_med, 'cta_diesel', r.empresa_id)
      ON CONFLICT (id) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_ok := v_ok + v_n;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('aceitas', v_ok, 'recusadas_so_consumo', v_rej, 'ja_existiam', v_dup);
END
$function$;

CREATE OR REPLACE FUNCTION public.diesel_vincular_equipamentos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE n integer;
BEGIN
  PERFORM app.exigir('diesel.gerenciar');
  UPDATE public.diesel_abastecimentos a
     SET equipamento_id = e.id
    FROM public.equipamentos e
   WHERE a.empresa_id = app.empresa_atual()
     AND e.empresa_id = a.empresa_id
     AND a.equipamento_id IS NULL
     AND a.chave_tag IS NOT NULL
     AND (app.chave_tag(e.tag) = a.chave_tag OR ('X' || app.chave_tag(e.tag)) = a.chave_tag);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$function$;

CREATE OR REPLACE FUNCTION public.importar_leituras(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_recebidas int; v_inseridas int;
BEGIN
  PERFORM app.exigir('frota.gerenciar');
  SELECT count(*) INTO v_recebidas FROM jsonb_to_recordset(p) AS x(t text, m text, d date, v numeric);
  WITH ins AS (
    INSERT INTO public.diario_horimetro
      (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, origem, empresa_id)
    SELECT md5('imp|' || e.id::text || '|' || upper(x.m) || '|' || x.d::text)::uuid, e.id, x.v,
           'IMPORTADO PLANILHA', least((x.d::text || ' 18:00:00-03')::timestamptz, now()), upper(x.m),
           'planilha_parte_diaria', e.empresa_id
    FROM jsonb_to_recordset(p) AS x(t text, m text, d date, v numeric)
    JOIN public.equipamentos e
      ON upper(e.tag) = upper(btrim(x.t)) AND e.empresa_id = app.empresa_atual()
    WHERE x.v > 0 AND upper(x.m) IN ('H', 'KM')
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridas FROM ins;
  RETURN jsonb_build_object('recebidas', v_recebidas, 'inseridas', v_inseridas, 'sem_equipamento_ou_repetidas', v_recebidas - v_inseridas);
END
$function$;

-- Anônimo: não chama app.exigir. A empresa da leitura é a da máquina.
CREATE OR REPLACE FUNCTION public.lancar_horimetro(
  p_equipamento uuid,
  p_leitura numeric,
  p_operador text DEFAULT ''::text,
  p_registrado_em timestamptz DEFAULT NULL,
  p_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eq public.equipamentos%rowtype;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_op text := left(btrim(coalesce(p_operador, '')), 80);
  v_quando timestamptz := least(coalesce(p_registrado_em, now()), now());
  v_ultimo timestamptz; v_limite numeric; v_atual numeric; v_med text;
BEGIN
  IF p_equipamento IS NULL OR p_leitura IS NULL OR p_leitura <= 0 THEN
    RAISE EXCEPTION 'LEITURA_INVALIDA: informe a leitura do painel.' USING ERRCODE = 'P0001';
  END IF;
  IF v_op = '' THEN RAISE EXCEPTION 'OPERADOR_OBRIGATORIO: informe matrícula ou nome.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.diario_horimetro WHERE id = v_id) THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true);
  END IF;
  SELECT * INTO v_eq FROM public.equipamentos WHERE id = p_equipamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EQUIPAMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0001'; END IF;
  v_med := CASE WHEN upper(coalesce(v_eq.unidade_medida, 'H')) = 'KM' THEN 'KM' ELSE 'H' END;
  v_limite := app.limite_salto_da_empresa(v_eq.unidade_medida, v_eq.horimetro_atualizado_em, v_quando, v_eq.empresa_id);
  v_atual := coalesce(v_eq.horimetro_atual, 0);
  SELECT max(registrado_em) INTO v_ultimo
    FROM public.diario_horimetro
   WHERE equipamento_id = p_equipamento AND empresa_id = v_eq.empresa_id AND medidor = v_med;

  IF v_atual > 0 AND p_leitura < v_atual THEN
    IF v_ultimo IS NOT NULL AND v_quando < v_ultimo THEN
      INSERT INTO public.diario_horimetro
        (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, empresa_id)
      VALUES (v_id, p_equipamento, p_leitura, v_op, v_quando, v_med, v_eq.empresa_id);
      RETURN jsonb_build_object('ok', true, 'atrasado', true, 'horimetro_atual', v_atual);
    END IF;
    RAISE EXCEPTION 'LEITURA_MENOR: a leitura % é menor que a atual (%).', p_leitura, v_atual USING ERRCODE = 'P0001';
  END IF;
  IF v_atual > 0 AND (p_leitura - v_atual) > v_limite THEN
    RAISE EXCEPTION 'SALTO_ALTO: desde a última leitura o máximo possível seria subir % (subiu %).',
      round(v_limite, 1), round(p_leitura - v_atual, 1) USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.diario_horimetro
    (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, empresa_id)
  VALUES (v_id, p_equipamento, p_leitura, v_op, v_quando, v_med, v_eq.empresa_id);
  UPDATE public.equipamentos
     SET horimetro_atual = p_leitura, horimetro_atualizado_em = v_quando
   WHERE id = p_equipamento AND empresa_id = v_eq.empresa_id;
  RETURN jsonb_build_object('ok', true, 'horimetro_atual', p_leitura);
END
$function$;

CREATE OR REPLACE FUNCTION public.os_assumir(p_os uuid, p_nome text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_nome text := upper(btrim(coalesce(p_nome, '')));
  v_os public.ordens_servico%rowtype;
  v_lista text[];
BEGIN
  PERFORM app.exigir('os.executar');
  IF v_nome = '' THEN RAISE EXCEPTION 'NOME_OBRIGATORIO' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_os FROM public.ordens_servico
   WHERE id = p_os AND empresa_id = app.empresa_atual() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OS_NAO_ENCONTRADA' USING ERRCODE = 'P0001'; END IF;
  IF v_os.concluida_em IS NOT NULL OR v_os.status IN ('concluida', 'aguardando_pcm') THEN
    RETURN jsonb_build_object('ok', true, 'ignorado', true, 'motivo', 'OS já encerrada');
  END IF;
  SELECT coalesce(array_agg(DISTINCT n), ARRAY[]::text[]) INTO v_lista
  FROM (
    SELECT upper(btrim(x)) n FROM unnest(string_to_array(coalesce(v_os.mecanico_nome, ''), ',')) x
    UNION SELECT v_nome
  ) t WHERE n <> '';
  UPDATE public.ordens_servico
     SET mecanico_nome = array_to_string(v_lista, ', '),
         status = CASE WHEN status IN ('aberta', 'pausada_peca') THEN 'em_execucao' ELSE status END
   WHERE id = p_os AND empresa_id = v_os.empresa_id;
  RETURN jsonb_build_object('ok', true, 'mecanico_nome', array_to_string(v_lista, ', '));
END
$function$;

CREATE OR REPLACE FUNCTION public.preventiva_gerar_os(p_plano uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record; v_pk public.preventiva_pacotes; v_n int; v_alvo numeric; v_os uuid; v_chk jsonb; v_qtd int := 0; v_loc text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM app.exigir('preventivas.gerar_os');
  END IF;
  FOR r IN
    SELECT p.*,
           CASE WHEN s.unidade = 'KM' THEN coalesce(e.km_atual, e.horimetro_atual) ELSE e.horimetro_atual END hor,
           e.obra_id, e.tag, s.horizonte, s.intervalo_base ib
    FROM public.planos_preventiva p
    JOIN public.equipamentos e ON e.id = p.equipamento_id AND e.empresa_id = p.empresa_id
    JOIN public.preventiva_estrategias s ON s.id = p.estrategia_id AND s.ativa AND s.empresa_id = p.empresa_id
    WHERE p.ativo
      AND (p_plano IS NULL OR p.id = p_plano)
      AND (auth.uid() IS NULL OR p.empresa_id = app.empresa_atual())
      AND e.situacao_ciclo = 'ativo'
      AND (p.os_aberta_id IS NULL OR EXISTS (
            SELECT 1 FROM public.ordens_servico o
            WHERE o.id = p.os_aberta_id AND o.status = 'concluida' AND o.empresa_id = p.empresa_id))
    FOR UPDATE OF p
  LOOP
    v_n := r.ciclo_atual + 1;
    v_alvo := coalesce(r.ultimo_horimetro_execucao, 0) + r.ib;
    CONTINUE WHEN (v_alvo - coalesce(r.hor, 0)) > r.horizonte AND p_plano IS NULL;
    v_pk := app.pacote_do_ciclo(r.estrategia_id, v_n);
    IF v_pk.id IS NULL THEN CONTINUE; END IF;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.ordens_servico
      WHERE plano_id = r.id AND ciclo = v_n AND empresa_id = r.empresa_id
    );
    SELECT coalesce(jsonb_agg(jsonb_build_object('t', t.descricao, 'ok', false) ORDER BY pk2.multiplo, t.ordem), '[]'::jsonb)
      INTO v_chk
      FROM public.preventiva_pacotes pk2
      JOIN public.preventiva_lista_tarefas t ON t.lista_id = pk2.lista_id AND t.empresa_id = pk2.empresa_id
      WHERE pk2.estrategia_id = r.estrategia_id
        AND pk2.empresa_id = r.empresa_id
        AND (pk2.id = v_pk.id OR (v_pk.acumulativo AND pk2.multiplo < v_pk.multiplo AND v_pk.multiplo % pk2.multiplo = 0));
    SELECT coalesce(l.local_padrao, 'OFICINA') INTO v_loc
      FROM public.preventiva_listas l
     WHERE l.id = v_pk.lista_id AND l.empresa_id = r.empresa_id;
    INSERT INTO public.ordens_servico
      (equipamento_id, obra_id, status, motivo_rep, local_manutencao_pcm, descricao_problema,
       plano_id, pacote, ciclo, contador_alvo, checklist, empresa_id)
    VALUES (r.equipamento_id, r.obra_id, 'aberta', 'PREVENTIVA', coalesce(v_loc, 'OFICINA'),
            'PREVENTIVA ' || v_pk.nome || ' (ciclo ' || v_n || ') - alvo ' || v_alvo,
            r.id, v_pk.nome, v_n, v_alvo, v_chk, r.empresa_id)
    RETURNING id INTO v_os;
    INSERT INTO public.os_pecas_previstas (os_id, peca_id, quantidade, empresa_id)
    SELECT v_os, m.peca_id, sum(m.quantidade), r.empresa_id
      FROM public.preventiva_pacotes pk2
      JOIN public.preventiva_lista_materiais m ON m.lista_id = pk2.lista_id AND m.empresa_id = pk2.empresa_id
      WHERE pk2.estrategia_id = r.estrategia_id
        AND pk2.empresa_id = r.empresa_id
        AND (pk2.id = v_pk.id OR (v_pk.acumulativo AND pk2.multiplo < v_pk.multiplo AND v_pk.multiplo % pk2.multiplo = 0))
      GROUP BY m.peca_id;
    UPDATE public.planos_preventiva SET os_aberta_id = v_os WHERE id = r.id AND empresa_id = r.empresa_id;
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'geradas', v_qtd);
END
$function$;

-- p_tag permanece na assinatura para o PostgREST antigo não quebrar. Não é usado.
CREATE OR REPLACE FUNCTION public.qr_equipamento(p_id uuid DEFAULT NULL, p_tag text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v jsonb;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT to_jsonb(x) INTO v FROM (
    SELECT e.id, e.tag, e.nome, e.unidade_medida, e.horimetro_atual, e.obra_id,
           e.horimetro_atualizado_em, e.empresa_id,
           (
             SELECT jsonb_build_object(
               'limite_km_dia', (cfg->>'limite_km_dia')::numeric,
               'tolerancia_horas', (cfg->>'tolerancia_horas')::numeric,
               'fixo_horas', (cfg->>'limite_salto_horas')::numeric,
               'fixo_km', (cfg->>'limite_salto_km')::numeric
             )
             FROM (SELECT app.limites_medidor(e.empresa_id) AS cfg) s
           ) AS cfg
    FROM public.equipamentos e
    WHERE e.id = p_id
    LIMIT 1
  ) x;
  RETURN v;
END
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_horimetro_atual()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_atualizados int; v_unidade int;
BEGIN
  PERFORM app.exigir('frota.gerenciar');
  CREATE TEMP TABLE _princ ON COMMIT DROP AS
  SELECT e.id,
         CASE WHEN EXISTS (
                SELECT 1 FROM public.diario_horimetro d
                WHERE d.equipamento_id = e.id AND d.empresa_id = e.empresa_id AND d.medidor = 'H'
                HAVING count(*) >= 10
              ) THEN 'H'
              WHEN upper(coalesce(e.unidade_medida, 'H')) = 'KM' THEN 'KM' ELSE 'H' END medidor
  FROM public.equipamentos e
  WHERE e.empresa_id = app.empresa_atual();
  CREATE TEMP TABLE _ult ON COMMIT DROP AS
  SELECT DISTINCT ON (d.equipamento_id) d.equipamento_id id, d.leitura, d.registrado_em, d.medidor
  FROM public.diario_horimetro d
  JOIN _princ p ON p.id = d.equipamento_id AND p.medidor = d.medidor
  WHERE d.empresa_id = app.empresa_atual()
  ORDER BY d.equipamento_id, d.registrado_em DESC, d.leitura DESC;
  SELECT count(*) INTO v_unidade FROM public.equipamentos e
  JOIN _ult u ON u.id = e.id
  WHERE e.empresa_id = app.empresa_atual() AND upper(coalesce(e.unidade_medida, 'H')) <> u.medidor;
  UPDATE public.equipamentos e
     SET horimetro_atual = u.leitura, horimetro_atualizado_em = u.registrado_em, unidade_medida = u.medidor
    FROM _ult u
   WHERE u.id = e.id
     AND e.empresa_id = app.empresa_atual()
     AND (e.horimetro_atualizado_em IS NULL OR e.horimetro_atualizado_em < u.registrado_em);
  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RETURN jsonb_build_object('equipamentos_atualizados', v_atualizados, 'unidade_trocada_para_horimetro', v_unidade);
END
$function$;

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

DO $$ BEGIN
  IF to_regprocedure('public.resolver_login(text)') IS NOT NULL THEN
    DROP FUNCTION public.resolver_login(text);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.resolver_login(p_texto text, p_empresa text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v text := lower(btrim(coalesce(p_texto, '')));
  v_codigo text := upper(btrim(coalesce(p_empresa, '')));
  v_empresa uuid;
  n int;
  r text;
BEGIN
  IF v = '' OR length(v) > 80 THEN RETURN NULL; END IF;
  IF v_codigo = '' THEN
    v_empresa := '00000000-0000-0000-0000-000000000001'::uuid;
  ELSE
    SELECT e.id INTO v_empresa
    FROM public.empresas e
    WHERE upper(e.codigo) = v_codigo AND e.ativa;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  SELECT count(*), min(u.email_login) INTO n, r
  FROM public.perfis_usuarios u
  WHERE u.empresa_id = v_empresa
    AND coalesce(u.ativo, true)
    AND u.auth_user_id IS NOT NULL
    AND u.email_login IS NOT NULL
    AND (
      lower(btrim(u.matricula)) = v
      OR lower(btrim(u.nome)) = v
      OR lower(split_part(btrim(u.nome), ' ', 1)) = v
    );
  IF n = 1 THEN RETURN r; END IF;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.resolver_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_equipamento(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lancar_horimetro(uuid, numeric, text, timestamptz, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION app.limites_medidor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.limite_salto_da_empresa(text, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.email_interno(text, text) FROM PUBLIC, anon, authenticated;

INSERT INTO public.migracoes_aplicadas (escopo, modulo_id, arquivo, checksum, aplicado_por)
VALUES ('plataforma', NULL, '0003_empresa_id_em_tudo.sql', md5('0003_empresa_id_em_tudo.sql'), current_user)
ON CONFLICT (escopo, arquivo) DO NOTHING;

DO $$ BEGIN
  IF NOT has_function_privilege('anon', 'public.resolver_login(text, text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.qr_equipamento(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.lancar_horimetro(uuid, numeric, text, timestamptz, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ficou sem as RPCs de login e de QR';
  END IF;
  IF has_function_privilege('anon', 'app.exigir(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'app.email_interno(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ficou com privilégio indevido depois da 0003';
  END IF;
  IF to_regprocedure('public.resolver_login(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'resolver_login(text) ainda existe e disputa com a assinatura nova';
  END IF;
END $$;
