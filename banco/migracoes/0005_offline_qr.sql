-- =============================================================================
-- 0005_offline_qr.sql — Vilasa-Manut
-- Etapa 6: versão mínima do aplicativo e abertura de OS pelo QR.
-- Pré-requisito: 0000, 0001, 0002, 0003 e 0004. Idempotente. Uma transação:
--   psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
-- Reversão: banco/migracoes/reverter/0005_offline_qr_reverter.sql
--
-- Não dá DROP de tabela, coluna, usuário nem policy.
-- versao_minima_app vale por empresa quando a coluna está preenchida e, no
-- contrário, cai no valor global de configuracoes_plataforma. meu_perfil
-- devolve esse texto no login. os_abrir_pelo_qr chama app.exigir('os.abrir'):
-- o almoxarife não tem essa permissão e o anon não executa a função.
-- A máquina entra só por p_equipamento (uuid). Não há parâmetro de tag.
-- =============================================================================
SET search_path = '';

DO $$ BEGIN
  IF to_regclass('public.equipamentos') IS NULL
     OR to_regclass('public.ordens_servico') IS NULL
     OR to_regclass('public.empresas') IS NULL
     OR to_regprocedure('app.exigir(text)') IS NULL
     OR to_regprocedure('public.meu_perfil()') IS NULL
     OR to_regprocedure('public.qr_equipamento(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'Esquema inesperado: aplique a 0000, a 0001, a 0002, a 0003 e a 0004 antes da 0005';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Versão mínima: global, com folga por empresa.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracoes_plataforma (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.configuracoes_plataforma ADD COLUMN IF NOT EXISTS valor text;
ALTER TABLE public.configuracoes_plataforma ADD COLUMN IF NOT EXISTS atualizado_em timestamptz DEFAULT now();

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS versao_minima_app text;

INSERT INTO public.configuracoes_plataforma (chave, valor)
VALUES ('versao_minima_app', 'v25')
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE public.configuracoes_plataforma ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.configuracoes_plataforma FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'configuracoes_plataforma'
      AND p.polname = 'configuracoes_plataforma_nega'
  ) THEN
    CREATE POLICY configuracoes_plataforma_nega
      ON public.configuracoes_plataforma
      AS PERMISSIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.versao_minima_app(p_empresa uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(
    (
      SELECT nullif(btrim(e.versao_minima_app), '')
      FROM public.empresas e
      WHERE e.id = coalesce(p_empresa, app.empresa_atual())
    ),
    (
      SELECT nullif(btrim(c.valor), '')
      FROM public.configuracoes_plataforma c
      WHERE c.chave = 'versao_minima_app'
    )
  )
$function$;

REVOKE ALL ON FUNCTION app.versao_minima_app(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.versao_minima_app(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Login passa a ler a versão mínima da empresa, ou a global.
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

-- p_tag permanece na assinatura e continua ignorado. A busca é só por id.
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
           ) AS cfg,
           (
             SELECT coalesce(jsonb_agg(em.modulo_id ORDER BY em.modulo_id), '[]'::jsonb)
             FROM public.empresa_modulos em
             WHERE em.empresa_id = e.empresa_id
               AND em.ativo
               AND (em.inicio IS NULL OR em.inicio <= CURRENT_DATE)
               AND (em.valido_ate IS NULL OR em.valido_ate >= CURRENT_DATE)
           ) AS modulos_ativos,
           (
             SELECT jsonb_build_object(
               'id', emp.id, 'nome', emp.nome, 'marca', emp.marca, 'termos', emp.termos
             )
             FROM public.empresas emp
             WHERE emp.id = e.empresa_id
           ) AS empresa
    FROM public.equipamentos e
    WHERE e.id = p_id
    LIMIT 1
  ) x;
  RETURN v;
END
$function$;

-- ---------------------------------------------------------------------------
-- Abre a OS no servidor. app.exigir('os.abrir') bloqueia almoxarife e anon.
-- Repetir o mesmo p_id não cria outra OS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.os_abrir_pelo_qr(
  p_equipamento uuid,
  p_problema text,
  p_localizacao text DEFAULT NULL,
  p_horimetro numeric DEFAULT NULL,
  p_mecanico text DEFAULT NULL,
  p_assumir boolean DEFAULT false,
  p_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eq public.equipamentos%rowtype;
  v_os public.ordens_servico%rowtype;
  v_problema text := upper(btrim(coalesce(p_problema, '')));
  v_local text := upper(btrim(coalesce(p_localizacao, '')));
  v_mecanico text := upper(btrim(coalesce(p_mecanico, '')));
  v_assumir boolean;
BEGIN
  PERFORM app.exigir('os.abrir');
  IF p_equipamento IS NULL THEN
    RAISE EXCEPTION 'EQUIPAMENTO_OBRIGATORIO: a máquina vem do QR, pelo id.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_problema = '' THEN
    RAISE EXCEPTION 'PROBLEMA_OBRIGATORIO: descreva o problema.'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_os
    FROM public.ordens_servico
    WHERE id = p_id AND empresa_id = app.empresa_atual();
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true, 'id', v_os.id, 'numero_os', v_os.numero_os, 'repetido', true
      );
    END IF;
  END IF;
  SELECT * INTO v_eq FROM public.equipamentos WHERE id = p_equipamento;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EQUIPAMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v_eq.empresa_id IS DISTINCT FROM app.empresa_atual() THEN
    RAISE EXCEPTION 'EQUIPAMENTO_DE_OUTRA_EMPRESA' USING ERRCODE = 'P0001';
  END IF;
  v_assumir := coalesce(p_assumir, false) AND app.pode('os.executar') AND v_mecanico <> '';
  INSERT INTO public.ordens_servico (
    id, equipamento_id, obra_id, status, motivo_rep, local_manutencao_pcm,
    descricao_problema, mecanico_nome, horimetro_os, aberta_em, empresa_id
  ) VALUES (
    coalesce(p_id, gen_random_uuid()),
    v_eq.id,
    v_eq.obra_id,
    CASE WHEN v_assumir THEN 'em_execucao' ELSE 'aberta' END,
    'CORRETIVA',
    nullif(v_local, ''),
    v_problema,
    CASE WHEN v_assumir THEN v_mecanico ELSE '' END,
    p_horimetro,
    now(),
    v_eq.empresa_id
  )
  RETURNING * INTO v_os;
  RETURN jsonb_build_object(
    'ok', true,
    'id', v_os.id,
    'numero_os', v_os.numero_os,
    'status', v_os.status,
    'repetido', false
  );
END
$function$;

REVOKE ALL ON FUNCTION public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)
  TO authenticated;

INSERT INTO public.migracoes_aplicadas (escopo, modulo_id, arquivo, checksum, aplicado_por)
VALUES ('plataforma', NULL, '0005_offline_qr.sql', md5('0005_offline_qr.sql'), current_user)
ON CONFLICT (escopo, arquivo) DO NOTHING;

DO $$ BEGIN
  IF has_function_privilege('anon', 'public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'app.versao_minima_app(uuid)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.configuracoes_plataforma', 'SELECT') THEN
    RAISE EXCEPTION 'anon ficou com privilégio da etapa 6';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'app.versao_minima_app(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou sem os_abrir_pelo_qr ou versao_minima_app';
  END IF;
  IF position('app.exigir' IN pg_get_functiondef('public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'os_abrir_pelo_qr não chama app.exigir';
  END IF;
END $$;
