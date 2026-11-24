-- =============================================================================
-- 0002_plataforma_empresas_modulos.sql — Vilasa-Manut
-- Etapa 3: empresas, catálogo de módulos e permissões no banco.
-- Pré-requisito: 0000_base_producao_2026-11-24.sql e 0001_seguranca_minima.sql.
-- Idempotente. Não faz DROP nem altera tabelas que já existiam. Não adiciona
-- empresa_id nas tabelas de negócio: isso é a etapa 4.
-- anon não recebe GRANT nenhum. authenticated só lê o próprio contexto.
-- Reversão: banco/migracoes/reverter/0002_plataforma_empresas_modulos_reverter.sql
-- Rodar como uma transação: psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
--
-- app.empresa_atual() devolve a empresa 1 até a etapa 4, quando o perfil passar
-- a ter empresa. app.modulo_ativo(text), app.pode(text) e app.exigir(text) são
-- STABLE SECURITY DEFINER, com search_path vazio, para uso em política como
-- (select app.pode('...')). app.exigir levanta SQLSTATE VM403.
-- O catálogo cobre os 7 manifestos e o núcleo (relatorios.exportar).
-- O seed da empresa 1 repete a matriz traduzida dos manifestos: sem operador
-- e sem os.abrir para almoxarife.
-- =============================================================================
SET search_path = '';

DO $$ BEGIN
  IF to_regclass('public.perfis_usuarios') IS NULL
     OR to_regprocedure('app.perfil_ativo()') IS NULL
     OR to_regprocedure('public.meu_perfil()') IS NULL THEN
    RAISE EXCEPTION 'Esquema inesperado: aplique a 0000 e a 0001 antes da 0002';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  plano_codigo text,
  termos jsonb NOT NULL DEFAULT '{}'::jsonb,
  marca jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS ativa boolean DEFAULT true;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS plano_codigo text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS termos jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS marca jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.modulos (
  id text PRIMARY KEY,
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'manutencao',
  obrigatorio boolean NOT NULL DEFAULT false,
  depende text[] NOT NULL DEFAULT ARRAY[]::text[],
  versao_atual text NOT NULL DEFAULT '1.0.0',
  estagio text NOT NULL DEFAULT 'estavel'
);
ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'manutencao';
ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS obrigatorio boolean DEFAULT false;
ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS depende text[] DEFAULT ARRAY[]::text[];
ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS versao_atual text DEFAULT '1.0.0';
ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS estagio text DEFAULT 'estavel';

CREATE TABLE IF NOT EXISTS public.empresa_modulos (
  empresa_id uuid NOT NULL,
  modulo_id text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  origem text NOT NULL DEFAULT 'avulso',
  inicio date,
  valido_ate date,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_versao integer NOT NULL DEFAULT 1,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  PRIMARY KEY (empresa_id, modulo_id)
);
ALTER TABLE public.empresa_modulos ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.empresa_modulos ADD COLUMN IF NOT EXISTS origem text DEFAULT 'avulso';
ALTER TABLE public.empresa_modulos ADD COLUMN IF NOT EXISTS inicio date;
ALTER TABLE public.empresa_modulos ADD COLUMN IF NOT EXISTS valido_ate date;
ALTER TABLE public.empresa_modulos ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.empresa_modulos ADD COLUMN IF NOT EXISTS config_versao integer DEFAULT 1;
ALTER TABLE public.empresa_modulos ADD COLUMN IF NOT EXISTS atualizado_em timestamptz DEFAULT now();
ALTER TABLE public.empresa_modulos ADD COLUMN IF NOT EXISTS atualizado_por uuid;

CREATE TABLE IF NOT EXISTS public.empresa_modulos_historico (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL,
  modulo_id text NOT NULL,
  operacao text NOT NULL,
  antes jsonb,
  depois jsonb,
  por uuid,
  em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.empresa_modulos_historico ADD COLUMN IF NOT EXISTS empresa_id uuid;
ALTER TABLE public.empresa_modulos_historico ADD COLUMN IF NOT EXISTS modulo_id text;
ALTER TABLE public.empresa_modulos_historico ADD COLUMN IF NOT EXISTS operacao text;
ALTER TABLE public.empresa_modulos_historico ADD COLUMN IF NOT EXISTS antes jsonb;
ALTER TABLE public.empresa_modulos_historico ADD COLUMN IF NOT EXISTS depois jsonb;
ALTER TABLE public.empresa_modulos_historico ADD COLUMN IF NOT EXISTS por uuid;
ALTER TABLE public.empresa_modulos_historico ADD COLUMN IF NOT EXISTS em timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.permissoes (
  id text PRIMARY KEY,
  modulo_id text NOT NULL,
  descricao text
);
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS modulo_id text;
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS descricao text;

CREATE TABLE IF NOT EXISTS public.cargos (
  empresa_id uuid NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  sistema boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  PRIMARY KEY (empresa_id, codigo)
);
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS sistema boolean DEFAULT false;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS public.cargo_permissoes (
  empresa_id uuid NOT NULL,
  cargo_codigo text NOT NULL,
  permissao_id text NOT NULL,
  PRIMARY KEY (empresa_id, cargo_codigo, permissao_id)
);

CREATE TABLE IF NOT EXISTS public.plataforma_usuarios (
  auth_user_id uuid PRIMARY KEY,
  papel text NOT NULL
);
ALTER TABLE public.plataforma_usuarios ADD COLUMN IF NOT EXISTS papel text;

CREATE TABLE IF NOT EXISTS public.migracoes_aplicadas (
  escopo text NOT NULL,
  modulo_id text,
  arquivo text NOT NULL,
  checksum text,
  aplicado_em timestamptz NOT NULL DEFAULT now(),
  aplicado_por text,
  PRIMARY KEY (escopo, arquivo)
);
ALTER TABLE public.migracoes_aplicadas ADD COLUMN IF NOT EXISTS modulo_id text;
ALTER TABLE public.migracoes_aplicadas ADD COLUMN IF NOT EXISTS checksum text;
ALTER TABLE public.migracoes_aplicadas ADD COLUMN IF NOT EXISTS aplicado_em timestamptz DEFAULT now();
ALTER TABLE public.migracoes_aplicadas ADD COLUMN IF NOT EXISTS aplicado_por text;

-- ---------------------------------------------------------------------------
-- Restrições (só cria se ainda não existem)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresas_codigo_key' AND conrelid = 'public.empresas'::regclass) THEN
    ALTER TABLE public.empresas ADD CONSTRAINT empresas_codigo_key UNIQUE (codigo);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresas_codigo_chk' AND conrelid = 'public.empresas'::regclass) THEN
    ALTER TABLE public.empresas ADD CONSTRAINT empresas_codigo_chk CHECK (length(btrim(codigo)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modulos_categoria_chk' AND conrelid = 'public.modulos'::regclass) THEN
    ALTER TABLE public.modulos ADD CONSTRAINT modulos_categoria_chk
      CHECK (categoria IN ('manutencao', 'producao', 'suprimentos', 'pessoas', 'plataforma'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modulos_estagio_chk' AND conrelid = 'public.modulos'::regclass) THEN
    ALTER TABLE public.modulos ADD CONSTRAINT modulos_estagio_chk
      CHECK (estagio IN ('beta', 'estavel', 'descontinuado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_modulos_origem_chk' AND conrelid = 'public.empresa_modulos'::regclass) THEN
    ALTER TABLE public.empresa_modulos ADD CONSTRAINT empresa_modulos_origem_chk
      CHECK (origem IN ('plano', 'avulso', 'cortesia', 'teste'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cargos_codigo_chk' AND conrelid = 'public.cargos'::regclass) THEN
    ALTER TABLE public.cargos ADD CONSTRAINT cargos_codigo_chk CHECK (codigo = lower(codigo) AND length(btrim(codigo)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plataforma_usuarios_papel_chk' AND conrelid = 'public.plataforma_usuarios'::regclass) THEN
    ALTER TABLE public.plataforma_usuarios ADD CONSTRAINT plataforma_usuarios_papel_chk CHECK (length(btrim(papel)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'migracoes_aplicadas_escopo_chk' AND conrelid = 'public.migracoes_aplicadas'::regclass) THEN
    ALTER TABLE public.migracoes_aplicadas ADD CONSTRAINT migracoes_aplicadas_escopo_chk
      CHECK (escopo IN ('plataforma', 'modulo'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_modulos_empresa_id_fkey' AND conrelid = 'public.empresa_modulos'::regclass) THEN
    ALTER TABLE public.empresa_modulos ADD CONSTRAINT empresa_modulos_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_modulos_modulo_id_fkey' AND conrelid = 'public.empresa_modulos'::regclass) THEN
    ALTER TABLE public.empresa_modulos ADD CONSTRAINT empresa_modulos_modulo_id_fkey
      FOREIGN KEY (modulo_id) REFERENCES public.modulos(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_modulos_historico_empresa_id_fkey' AND conrelid = 'public.empresa_modulos_historico'::regclass) THEN
    ALTER TABLE public.empresa_modulos_historico ADD CONSTRAINT empresa_modulos_historico_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permissoes_modulo_id_fkey' AND conrelid = 'public.permissoes'::regclass) THEN
    ALTER TABLE public.permissoes ADD CONSTRAINT permissoes_modulo_id_fkey
      FOREIGN KEY (modulo_id) REFERENCES public.modulos(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cargos_empresa_id_fkey' AND conrelid = 'public.cargos'::regclass) THEN
    ALTER TABLE public.cargos ADD CONSTRAINT cargos_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cargo_permissoes_permissao_id_fkey' AND conrelid = 'public.cargo_permissoes'::regclass) THEN
    ALTER TABLE public.cargo_permissoes ADD CONSTRAINT cargo_permissoes_permissao_id_fkey
      FOREIGN KEY (permissao_id) REFERENCES public.permissoes(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cargo_permissoes_cargo_fkey' AND conrelid = 'public.cargo_permissoes'::regclass) THEN
    ALTER TABLE public.cargo_permissoes ADD CONSTRAINT cargo_permissoes_cargo_fkey
      FOREIGN KEY (empresa_id, cargo_codigo) REFERENCES public.cargos(empresa_id, codigo) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plataforma_usuarios_auth_user_id_fkey' AND conrelid = 'public.plataforma_usuarios'::regclass) THEN
    ALTER TABLE public.plataforma_usuarios ADD CONSTRAINT plataforma_usuarios_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS permissoes_modulo_idx ON public.permissoes (modulo_id);
CREATE INDEX IF NOT EXISTS empresa_modulos_historico_empresa_idx
  ON public.empresa_modulos_historico (empresa_id, em DESC);

-- ---------------------------------------------------------------------------
-- Funções. search_path vazio e SECURITY DEFINER, como o restante de app.*.
-- app.avaliar_permissao é o miolo de app.pode, para o teste por cargo sem
-- personificar usuário. Não é concedida a anon nem a authenticated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.empresa_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  -- Etapa 4 passa a ler perfis_usuarios.empresa_id. Até lá só existe a empresa 1.
  SELECT '00000000-0000-0000-0000-000000000001'::uuid
$function$;

CREATE OR REPLACE FUNCTION app.modulo_ativo(p_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.empresa_modulos em
    WHERE em.empresa_id = app.empresa_atual()
      AND em.modulo_id = p_modulo
      AND em.ativo
      AND (em.inicio IS NULL OR em.inicio <= CURRENT_DATE)
      AND (em.valido_ate IS NULL OR em.valido_ate >= CURRENT_DATE)
  )
$function$;

CREATE OR REPLACE FUNCTION app.avaliar_permissao(p_permissao text, p_cargos text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH cargos AS (
    SELECT coalesce(array_agg(lower(btrim(c))), ARRAY[]::text[]) AS lista
    FROM unnest(coalesce(p_cargos, ARRAY[]::text[])) AS c
    WHERE btrim(coalesce(c, '')) <> ''
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.permissoes perm
    CROSS JOIN cargos
    WHERE perm.id = p_permissao
      AND app.modulo_ativo(perm.modulo_id)
      AND (
        'admin' = ANY (cargos.lista)
        OR EXISTS (
          SELECT 1
          FROM public.cargo_permissoes cp
          WHERE cp.empresa_id = app.empresa_atual()
            AND cp.permissao_id = perm.id
            AND cp.cargo_codigo = ANY (cargos.lista)
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION app.pode(p_permissao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT app.avaliar_permissao(p_permissao, app.cargos())
$function$;

CREATE OR REPLACE FUNCTION app.exigir(p_permissao text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT app.pode(p_permissao) THEN
    RAISE EXCEPTION 'VM403: sem permissão para "%".', coalesce(p_permissao, '')
      USING ERRCODE = 'VM403';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION app.carimbar_empresa_modulos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.atualizado_em := coalesce(NEW.atualizado_em, now());
    RETURN NEW;
  END IF;
  IF NEW.ativo IS DISTINCT FROM OLD.ativo
     OR NEW.origem IS DISTINCT FROM OLD.origem
     OR NEW.inicio IS DISTINCT FROM OLD.inicio
     OR NEW.valido_ate IS DISTINCT FROM OLD.valido_ate
     OR NEW.config IS DISTINCT FROM OLD.config
     OR NEW.config_versao IS DISTINCT FROM OLD.config_versao THEN
    NEW.atualizado_em := now();
    IF NEW.atualizado_por IS NULL THEN
      NEW.atualizado_por := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

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
       SELECT 1
       FROM public.empresa_modulos em
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

CREATE OR REPLACE FUNCTION app.registrar_historico_empresa_modulos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.ativo IS NOT DISTINCT FROM NEW.ativo
     AND OLD.origem IS NOT DISTINCT FROM NEW.origem
     AND OLD.inicio IS NOT DISTINCT FROM NEW.inicio
     AND OLD.valido_ate IS NOT DISTINCT FROM NEW.valido_ate
     AND OLD.config IS NOT DISTINCT FROM NEW.config
     AND OLD.config_versao IS NOT DISTINCT FROM NEW.config_versao THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.empresa_modulos_historico (empresa_id, modulo_id, operacao, antes, depois, por)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.empresa_id ELSE NEW.empresa_id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.modulo_id ELSE NEW.modulo_id END,
    lower(TG_OP),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    auth.uid()
  );
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS empresa_modulos_carimbar ON public.empresa_modulos;
CREATE TRIGGER empresa_modulos_carimbar
  BEFORE INSERT OR UPDATE ON public.empresa_modulos
  FOR EACH ROW
  EXECUTE FUNCTION app.carimbar_empresa_modulos();

DROP TRIGGER IF EXISTS empresa_modulos_historico ON public.empresa_modulos;
CREATE TRIGGER empresa_modulos_historico
  AFTER INSERT OR UPDATE OR DELETE ON public.empresa_modulos
  FOR EACH ROW
  EXECUTE FUNCTION app.registrar_historico_empresa_modulos();

-- Adiada para enxergar o lote inteiro do seed (e um UPDATE de vários módulos
-- na mesma transação) antes de recusar dependência faltando.
DROP TRIGGER IF EXISTS empresa_modulos_validar ON public.empresa_modulos;
CREATE CONSTRAINT TRIGGER empresa_modulos_validar
  AFTER INSERT OR UPDATE OR DELETE ON public.empresa_modulos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION app.validar_empresa_modulos();

-- ---------------------------------------------------------------------------
-- RLS e grants. Leitura do próprio contexto. anon fica sem nada.
-- migracoes_aplicadas não tem policy: só o dono da tabela lê.
-- ---------------------------------------------------------------------------
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_modulos_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plataforma_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migracoes_aplicadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresas_sel_contexto ON public.empresas;
CREATE POLICY empresas_sel_contexto ON public.empresas
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT app.perfil_ativo()) AND id = (SELECT app.empresa_atual()));

DROP POLICY IF EXISTS modulos_sel_contexto ON public.modulos;
CREATE POLICY modulos_sel_contexto ON public.modulos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT app.perfil_ativo())
    AND EXISTS (
      SELECT 1 FROM public.empresa_modulos em
      WHERE em.modulo_id = modulos.id
        AND em.empresa_id = (SELECT app.empresa_atual())
    )
  );

DROP POLICY IF EXISTS empresa_modulos_sel_contexto ON public.empresa_modulos;
CREATE POLICY empresa_modulos_sel_contexto ON public.empresa_modulos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT app.perfil_ativo()) AND empresa_id = (SELECT app.empresa_atual()));

DROP POLICY IF EXISTS empresa_modulos_historico_sel_contexto ON public.empresa_modulos_historico;
CREATE POLICY empresa_modulos_historico_sel_contexto ON public.empresa_modulos_historico
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT app.perfil_ativo()) AND empresa_id = (SELECT app.empresa_atual()));

DROP POLICY IF EXISTS permissoes_sel_contexto ON public.permissoes;
CREATE POLICY permissoes_sel_contexto ON public.permissoes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT app.perfil_ativo())
    AND EXISTS (
      SELECT 1 FROM public.empresa_modulos em
      WHERE em.modulo_id = permissoes.modulo_id
        AND em.empresa_id = (SELECT app.empresa_atual())
    )
  );

DROP POLICY IF EXISTS cargos_sel_contexto ON public.cargos;
CREATE POLICY cargos_sel_contexto ON public.cargos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT app.perfil_ativo()) AND empresa_id = (SELECT app.empresa_atual()));

DROP POLICY IF EXISTS cargo_permissoes_sel_contexto ON public.cargo_permissoes;
CREATE POLICY cargo_permissoes_sel_contexto ON public.cargo_permissoes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT app.perfil_ativo()) AND empresa_id = (SELECT app.empresa_atual()));

DROP POLICY IF EXISTS plataforma_usuarios_sel_proprio ON public.plataforma_usuarios;
CREATE POLICY plataforma_usuarios_sel_proprio ON public.plataforma_usuarios
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE
  public.empresas,
  public.modulos,
  public.empresa_modulos,
  public.empresa_modulos_historico,
  public.permissoes,
  public.cargos,
  public.cargo_permissoes,
  public.plataforma_usuarios,
  public.migracoes_aplicadas
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.empresas,
  public.modulos,
  public.empresa_modulos,
  public.empresa_modulos_historico,
  public.permissoes,
  public.cargos,
  public.cargo_permissoes,
  public.plataforma_usuarios
TO authenticated;

REVOKE ALL ON SEQUENCE public.empresa_modulos_historico_id_seq FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app.empresa_atual() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.modulo_ativo(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.avaliar_permissao(text, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pode(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.exigir(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.carimbar_empresa_modulos() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.validar_empresa_modulos() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.registrar_historico_empresa_modulos() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION app.empresa_atual() TO authenticated;
GRANT EXECUTE ON FUNCTION app.modulo_ativo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.pode(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.exigir(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.carimbar_empresa_modulos() TO authenticated;
GRANT EXECUTE ON FUNCTION app.validar_empresa_modulos() TO authenticated;
GRANT EXECUTE ON FUNCTION app.registrar_historico_empresa_modulos() TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed da empresa 1 e do catálogo. ON CONFLICT não apaga config já gravada
-- nem reativa um módulo que alguém desligou depois: a segunda rodada não
-- reescreve empresa_modulos nem cargo_permissoes.
-- ---------------------------------------------------------------------------
INSERT INTO public.empresas (id, codigo, nome)
VALUES ('00000000-0000-0000-0000-000000000001', 'VILASA', 'Vilasa')
ON CONFLICT (id) DO UPDATE SET codigo = EXCLUDED.codigo, nome = EXCLUDED.nome;

INSERT INTO public.modulos (id, nome, categoria, obrigatorio, depende, versao_atual, estagio) VALUES
  ('admin', 'Administração', 'plataforma', true, ARRAY['nucleo']::text[], '1.0.0', 'estavel'),
  ('diesel', 'Diesel', 'manutencao', false, ARRAY['frota']::text[], '1.0.0', 'estavel'),
  ('estoque', 'Almoxarifado', 'suprimentos', false, ARRAY['nucleo']::text[], '1.0.0', 'estavel'),
  ('frota', 'Frota & QR', 'manutencao', false, ARRAY['nucleo']::text[], '1.0.0', 'estavel'),
  ('nucleo', 'Núcleo', 'plataforma', true, ARRAY[]::text[], '1.0.0', 'estavel'),
  ('os', 'Ordens & REP', 'manutencao', false, ARRAY['nucleo']::text[], '1.0.0', 'estavel'),
  ('painel', 'Indicadores', 'manutencao', false, ARRAY['os']::text[], '1.0.0', 'estavel'),
  ('preventivas', 'Preventivas (SAP PM)', 'manutencao', false, ARRAY['os', 'frota']::text[], '1.0.0', 'estavel')
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  obrigatorio = EXCLUDED.obrigatorio,
  depende = EXCLUDED.depende,
  versao_atual = EXCLUDED.versao_atual,
  estagio = EXCLUDED.estagio;

INSERT INTO public.permissoes (id, modulo_id, descricao) VALUES
  ('admin.ver', 'admin', 'Ver a administração'),
  ('admin.usuarios', 'admin', 'Gerir usuários e obras'),
  ('admin.modo_deus', 'admin', 'Editar tabelas no Controle Mestre'),
  ('diesel.ver', 'diesel', 'Ver estoque, consumo e abastecimentos'),
  ('diesel.gerenciar', 'diesel', 'Lançar, aceitar e conciliar diesel'),
  ('estoque.ver', 'estoque', 'Ver o almoxarifado'),
  ('estoque.catalogo', 'estoque', 'Cadastrar e editar o catálogo'),
  ('estoque.entrada', 'estoque', 'Lançar nota fiscal de entrada'),
  ('estoque.baixar', 'estoque', 'Dar baixa de peças'),
  ('frota.ver', 'frota', 'Ver a frota, o ciclo de vida e as etiquetas QR'),
  ('frota.gerenciar', 'frota', 'Cadastrar, editar, transferir e corrigir leitura'),
  ('frota.lancar_leitura', 'frota', 'Lançar horímetro ou quilometragem pelo QR'),
  ('relatorios.exportar', 'nucleo', 'Exportar e imprimir os relatórios da tela atual'),
  ('os.ver', 'os', 'Ver ordens de serviço e o quadro REP'),
  ('os.abrir', 'os', 'Abrir ordem de serviço'),
  ('os.executar', 'os', 'Executar, assumir e concluir ordem de serviço'),
  ('os.classificar_rep', 'os', 'Classificar a falha e fazer a triagem do PCM'),
  ('painel.ver', 'painel', 'Ver os indicadores'),
  ('preventivas.ver', 'preventivas', 'Ver planos e a projeção'),
  ('preventivas.gerenciar', 'preventivas', 'Criar e editar estratégias, listas e planos'),
  ('preventivas.gerar_os', 'preventivas', 'Gerar ordem de serviço a partir do plano')
ON CONFLICT (id) DO UPDATE SET modulo_id = EXCLUDED.modulo_id, descricao = EXCLUDED.descricao;

INSERT INTO public.cargos (empresa_id, codigo, nome, sistema) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', 'Administrador Master', true),
  ('00000000-0000-0000-0000-000000000001', 'almoxarife', 'Almoxarife / Compras', true),
  ('00000000-0000-0000-0000-000000000001', 'encarregado', 'Encarregado', true),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'Engenheiro de Manutenção', true),
  ('00000000-0000-0000-0000-000000000001', 'gestor', 'Gestor / Diretoria', true),
  ('00000000-0000-0000-0000-000000000001', 'mecanico', 'Mecânico / Eletricista', true),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'Analista de PCM', true)
ON CONFLICT (empresa_id, codigo) DO UPDATE SET nome = EXCLUDED.nome, sistema = EXCLUDED.sistema;

INSERT INTO public.cargo_permissoes (empresa_id, cargo_codigo, permissao_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', 'admin.modo_deus'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'admin.usuarios'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'admin.ver'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'diesel.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'diesel.ver'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'estoque.baixar'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'estoque.catalogo'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'estoque.entrada'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'estoque.ver'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'frota.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'frota.lancar_leitura'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'frota.ver'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'os.abrir'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'os.classificar_rep'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'os.executar'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'os.ver'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'painel.ver'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'preventivas.gerar_os'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'preventivas.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'preventivas.ver'),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'relatorios.exportar'),
  ('00000000-0000-0000-0000-000000000001', 'almoxarife', 'estoque.baixar'),
  ('00000000-0000-0000-0000-000000000001', 'almoxarife', 'estoque.catalogo'),
  ('00000000-0000-0000-0000-000000000001', 'almoxarife', 'estoque.entrada'),
  ('00000000-0000-0000-0000-000000000001', 'almoxarife', 'estoque.ver'),
  ('00000000-0000-0000-0000-000000000001', 'almoxarife', 'frota.ver'),
  ('00000000-0000-0000-0000-000000000001', 'almoxarife', 'os.ver'),
  ('00000000-0000-0000-0000-000000000001', 'almoxarife', 'relatorios.exportar'),
  ('00000000-0000-0000-0000-000000000001', 'encarregado', 'os.abrir'),
  ('00000000-0000-0000-0000-000000000001', 'encarregado', 'os.ver'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'diesel.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'diesel.ver'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'estoque.baixar'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'estoque.catalogo'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'estoque.entrada'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'estoque.ver'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'frota.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'frota.lancar_leitura'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'frota.ver'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'os.abrir'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'os.classificar_rep'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'os.executar'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'os.ver'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'painel.ver'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'preventivas.gerar_os'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'preventivas.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'preventivas.ver'),
  ('00000000-0000-0000-0000-000000000001', 'engenheiro', 'relatorios.exportar'),
  ('00000000-0000-0000-0000-000000000001', 'gestor', 'diesel.ver'),
  ('00000000-0000-0000-0000-000000000001', 'gestor', 'estoque.ver'),
  ('00000000-0000-0000-0000-000000000001', 'gestor', 'frota.ver'),
  ('00000000-0000-0000-0000-000000000001', 'gestor', 'os.ver'),
  ('00000000-0000-0000-0000-000000000001', 'gestor', 'painel.ver'),
  ('00000000-0000-0000-0000-000000000001', 'gestor', 'preventivas.ver'),
  ('00000000-0000-0000-0000-000000000001', 'gestor', 'relatorios.exportar'),
  ('00000000-0000-0000-0000-000000000001', 'mecanico', 'estoque.ver'),
  ('00000000-0000-0000-0000-000000000001', 'mecanico', 'frota.lancar_leitura'),
  ('00000000-0000-0000-0000-000000000001', 'mecanico', 'os.abrir'),
  ('00000000-0000-0000-0000-000000000001', 'mecanico', 'os.executar'),
  ('00000000-0000-0000-0000-000000000001', 'mecanico', 'os.ver'),
  ('00000000-0000-0000-0000-000000000001', 'mecanico', 'preventivas.ver'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'diesel.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'diesel.ver'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'estoque.ver'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'frota.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'frota.ver'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'os.abrir'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'os.classificar_rep'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'os.executar'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'os.ver'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'painel.ver'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'preventivas.gerar_os'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'preventivas.gerenciar'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'preventivas.ver'),
  ('00000000-0000-0000-0000-000000000001', 'pcm', 'relatorios.exportar')
ON CONFLICT (empresa_id, cargo_codigo, permissao_id) DO NOTHING;

-- Núcleo primeiro; o trigger adiado confere o lote no fim da transação.
INSERT INTO public.empresa_modulos (empresa_id, modulo_id, ativo, origem) VALUES
  ('00000000-0000-0000-0000-000000000001', 'nucleo', true, 'avulso'),
  ('00000000-0000-0000-0000-000000000001', 'admin', true, 'avulso'),
  ('00000000-0000-0000-0000-000000000001', 'os', true, 'avulso'),
  ('00000000-0000-0000-0000-000000000001', 'frota', true, 'avulso'),
  ('00000000-0000-0000-0000-000000000001', 'estoque', true, 'avulso'),
  ('00000000-0000-0000-0000-000000000001', 'diesel', true, 'avulso'),
  ('00000000-0000-0000-0000-000000000001', 'painel', true, 'avulso'),
  ('00000000-0000-0000-0000-000000000001', 'preventivas', true, 'avulso')
ON CONFLICT (empresa_id, modulo_id) DO NOTHING;

-- Mesmas chaves de hoje, mais empresa, módulos ativos e permissões efetivas.
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
      (
        SELECT jsonb_build_object(
          'id', e.id,
          'codigo', e.codigo,
          'nome', e.nome,
          'marca', e.marca,
          'termos', e.termos
        )
        FROM public.empresas e
        WHERE e.id = app.empresa_atual()
      ) AS empresa,
      (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', em.modulo_id,
          'versao_config', em.config_versao,
          'config', em.config
        ) ORDER BY em.modulo_id), '[]'::jsonb)
        FROM public.empresa_modulos em
        WHERE em.empresa_id = app.empresa_atual()
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

INSERT INTO public.migracoes_aplicadas (escopo, modulo_id, arquivo, checksum, aplicado_por)
VALUES (
  'plataforma',
  NULL,
  '0002_plataforma_empresas_modulos.sql',
  md5('0002_plataforma_empresas_modulos.sql'),
  current_user
)
ON CONFLICT (escopo, arquivo) DO NOTHING;

DO $$ BEGIN
  IF has_table_privilege('anon', 'public.empresas', 'SELECT')
     OR has_table_privilege('anon', 'public.permissoes', 'SELECT')
     OR has_function_privilege('anon', 'app.pode(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'app.exigir(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.meu_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ficou com privilégio indevido depois da 0002';
  END IF;
  IF NOT has_function_privilege('authenticated', 'app.pode(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.meu_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou sem EXECUTE em app.pode ou meu_perfil';
  END IF;
END $$;
