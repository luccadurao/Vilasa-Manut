-- =============================================================================
-- 0004_locais_ativos.sql — Vilasa-Manut
-- Etapa 5: locais no lugar conceitual de obras, tipos de ativo e view ativos.
-- Pré-requisito: 0000, 0001, 0002 e 0003. Idempotente. Uma transação:
--   psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
-- Reversão: banco/migracoes/reverter/0004_locais_ativos_reverter.sql
--
-- Não dá DROP de tabela, coluna, usuário nem policy.
-- A tabela public.obras não é apagada: é renomeada para public.obras_base,
-- com a policy obras_autenticado_ativo, as FKs e a unicidade por empresa.
-- A view public.obras (security_invoker) devolve as mesmas colunas que o
-- front já lê e grava: id, codigo, nome, ativa, empresa_id. O id de cada
-- obra vira o id do local de nível 1. Obra nova entra nos dois.
-- =============================================================================
SET search_path = '';

DO $$ BEGIN
  IF to_regclass('public.obras') IS NULL
     OR to_regclass('public.equipamentos') IS NULL
     OR to_regclass('public.empresas') IS NULL
     OR to_regprocedure('app.exigir(text)') IS NULL
     OR to_regprocedure('app.pode(text)') IS NULL
     OR to_regprocedure('app.obra_ok(uuid)') IS NULL
     OR to_regprocedure('app.empresa_atual()') IS NULL THEN
    RAISE EXCEPTION 'Esquema inesperado: aplique a 0000, a 0001, a 0002 e a 0003 antes da 0004';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- locais e níveis. ativo pode ser nulo: obras.ativa é nula em obra antiga,
-- e o seletor filtra ativa = true. Nulo continua nulo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT app.empresa_atual(),
  pai_id uuid,
  nivel smallint NOT NULL DEFAULT 1,
  tipo text,
  codigo text NOT NULL,
  nome text NOT NULL,
  ativo boolean,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  caminho text NOT NULL
);
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS empresa_id uuid;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS pai_id uuid;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS nivel smallint DEFAULT 1;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS ativo boolean;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS extras jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS caminho text;
ALTER TABLE public.locais ALTER COLUMN empresa_id SET DEFAULT app.empresa_atual();
ALTER TABLE public.locais ALTER COLUMN extras SET DEFAULT '{}'::jsonb;
ALTER TABLE public.locais ALTER COLUMN nivel SET DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'locais_empresa_id_fkey' AND conrelid = 'public.locais'::regclass
  ) THEN
    ALTER TABLE public.locais
      ADD CONSTRAINT locais_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'locais_pai_id_fkey' AND conrelid = 'public.locais'::regclass
  ) THEN
    ALTER TABLE public.locais
      ADD CONSTRAINT locais_pai_id_fkey
      FOREIGN KEY (pai_id) REFERENCES public.locais(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'locais_empresa_codigo_key' AND conrelid = 'public.locais'::regclass
  ) THEN
    ALTER TABLE public.locais
      ADD CONSTRAINT locais_empresa_codigo_key UNIQUE (empresa_id, codigo);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'locais_nivel_chk' AND conrelid = 'public.locais'::regclass
  ) THEN
    ALTER TABLE public.locais
      ADD CONSTRAINT locais_nivel_chk CHECK (nivel >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS locais_empresa_id_idx ON public.locais (empresa_id);
CREATE INDEX IF NOT EXISTS locais_pai_id_idx ON public.locais (pai_id);
CREATE INDEX IF NOT EXISTS locais_caminho_idx ON public.locais (caminho text_pattern_ops);

CREATE TABLE IF NOT EXISTS public.locais_niveis (
  empresa_id uuid NOT NULL,
  nivel smallint NOT NULL,
  termo text NOT NULL,
  PRIMARY KEY (empresa_id, nivel)
);
ALTER TABLE public.locais_niveis ADD COLUMN IF NOT EXISTS termo text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'locais_niveis_empresa_id_fkey' AND conrelid = 'public.locais_niveis'::regclass
  ) THEN
    ALTER TABLE public.locais_niveis
      ADD CONSTRAINT locais_niveis_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS locais_niveis_empresa_id_idx ON public.locais_niveis (empresa_id);

-- ---------------------------------------------------------------------------
-- Caminho materializado /<raiz>/<filho>/ para filtrar a subárvore com LIKE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.locais_caminho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pai text;
  v_nivel smallint;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := app.empresa_atual();
  END IF;
  IF NEW.extras IS NULL THEN
    NEW.extras := '{}'::jsonb;
  END IF;
  IF NEW.pai_id IS NULL THEN
    NEW.nivel := 1;
    NEW.caminho := '/' || NEW.id::text || '/';
    RETURN NEW;
  END IF;
  SELECT l.caminho, l.nivel INTO v_pai, v_nivel
  FROM public.locais l
  WHERE l.id = NEW.pai_id
    AND l.empresa_id = NEW.empresa_id;
  IF v_pai IS NULL THEN
    RAISE EXCEPTION 'LOCAL_PAI_INVALIDO' USING ERRCODE = '23503';
  END IF;
  IF v_pai LIKE '%/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'LOCAL_CICLO' USING ERRCODE = '23514';
  END IF;
  NEW.nivel := v_nivel + 1;
  NEW.caminho := v_pai || NEW.id::text || '/';
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS locais_caminho_biu ON public.locais;
CREATE TRIGGER locais_caminho_biu
  BEFORE INSERT OR UPDATE OF id, empresa_id, pai_id ON public.locais
  FOR EACH ROW
  EXECUTE FUNCTION app.locais_caminho();

-- ---------------------------------------------------------------------------
-- Copia as obras com o mesmo id e troca o nome da tabela pela view.
-- Na segunda rodada a view já existe e só completa o que faltar em locais.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  kind "char";
BEGIN
  SELECT c.relkind INTO kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'obras';

  IF kind = 'r' THEN
    IF to_regclass('public.obras_base') IS NOT NULL THEN
      RAISE EXCEPTION 'public.obras_base já existe e public.obras ainda é tabela';
    END IF;
    PERFORM set_config('app.sync_local', '1', true);
    INSERT INTO public.locais (id, empresa_id, pai_id, nivel, tipo, codigo, nome, ativo, extras)
    SELECT o.id, o.empresa_id, NULL, 1, 'obra', o.codigo, o.nome, o.ativa, '{}'::jsonb
    FROM public.obras o
    ON CONFLICT (id) DO NOTHING;
    PERFORM set_config('app.sync_local', '', true);
    ALTER TABLE public.obras RENAME TO obras_base;
  ELSIF kind = 'v' THEN
    IF to_regclass('public.obras_base') IS NULL THEN
      RAISE EXCEPTION 'A view public.obras existe sem a tabela public.obras_base';
    END IF;
    PERFORM set_config('app.sync_local', '1', true);
    INSERT INTO public.locais (id, empresa_id, pai_id, nivel, tipo, codigo, nome, ativo, extras)
    SELECT o.id, o.empresa_id, NULL, 1, 'obra', o.codigo, o.nome, o.ativa, '{}'::jsonb
    FROM public.obras_base o
    ON CONFLICT (id) DO NOTHING;
    PERFORM set_config('app.sync_local', '', true);
  ELSE
    RAISE EXCEPTION 'public.obras não é tabela nem view (relkind %)', coalesce(kind::text, 'ausente');
  END IF;
END $$;

CREATE OR REPLACE VIEW public.obras
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.codigo,
  l.nome,
  l.ativo AS ativa,
  l.empresa_id
FROM public.locais l
WHERE l.nivel = 1
  AND l.pai_id IS NULL;

ALTER VIEW public.obras SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- A view grava em locais e em obras_base. O flag evita o espelho recursivo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.obras_view_io()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_empresa uuid;
BEGIN
  PERFORM set_config('app.sync_local', '1', true);
  IF TG_OP = 'INSERT' THEN
    v_id := coalesce(NEW.id, gen_random_uuid());
    v_empresa := coalesce(NEW.empresa_id, app.empresa_atual());
    IF v_empresa IS NULL THEN
      RAISE EXCEPTION 'EMPRESA_OBRIGATORIA' USING ERRCODE = '23502';
    END IF;
    INSERT INTO public.locais (id, empresa_id, pai_id, nivel, tipo, codigo, nome, ativo, extras)
    VALUES (v_id, v_empresa, NULL, 1, 'obra', NEW.codigo, NEW.nome, NEW.ativa, '{}'::jsonb);
    INSERT INTO public.obras_base (id, codigo, nome, ativa, empresa_id)
    VALUES (v_id, NEW.codigo, NEW.nome, NEW.ativa, v_empresa);
    NEW.id := v_id;
    NEW.empresa_id := v_empresa;
    PERFORM set_config('app.sync_local', '', true);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_empresa := coalesce(NEW.empresa_id, OLD.empresa_id);
    UPDATE public.locais
       SET codigo = NEW.codigo,
           nome = NEW.nome,
           ativo = NEW.ativa,
           empresa_id = v_empresa
     WHERE id = OLD.id
       AND nivel = 1;
    UPDATE public.obras_base
       SET codigo = NEW.codigo,
           nome = NEW.nome,
           ativa = NEW.ativa,
           empresa_id = v_empresa
     WHERE id = OLD.id;
    NEW.empresa_id := v_empresa;
    PERFORM set_config('app.sync_local', '', true);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.locais WHERE id = OLD.id AND nivel = 1;
    DELETE FROM public.obras_base WHERE id = OLD.id;
    PERFORM set_config('app.sync_local', '', true);
    RETURN OLD;
  END IF;
  PERFORM set_config('app.sync_local', '', true);
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS obras_view_io ON public.obras;
CREATE TRIGGER obras_view_io
  INSTEAD OF INSERT OR UPDATE OR DELETE ON public.obras
  FOR EACH ROW
  EXECUTE FUNCTION app.obras_view_io();

CREATE OR REPLACE FUNCTION app.locais_sync_obra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(current_setting('app.sync_local', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  PERFORM set_config('app.sync_local', '1', true);
  IF TG_OP = 'DELETE' THEN
    IF OLD.nivel = 1 AND OLD.pai_id IS NULL THEN
      DELETE FROM public.obras_base WHERE id = OLD.id;
    END IF;
    PERFORM set_config('app.sync_local', '', true);
    RETURN OLD;
  END IF;
  IF NEW.nivel = 1 AND NEW.pai_id IS NULL THEN
    INSERT INTO public.obras_base (id, codigo, nome, ativa, empresa_id)
    VALUES (NEW.id, NEW.codigo, NEW.nome, NEW.ativo, NEW.empresa_id)
    ON CONFLICT (id) DO UPDATE
      SET codigo = EXCLUDED.codigo,
          nome = EXCLUDED.nome,
          ativa = EXCLUDED.ativa,
          empresa_id = EXCLUDED.empresa_id;
  END IF;
  PERFORM set_config('app.sync_local', '', true);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS locais_sync_obra ON public.locais;
CREATE TRIGGER locais_sync_obra
  AFTER INSERT OR UPDATE OR DELETE ON public.locais
  FOR EACH ROW
  EXECUTE FUNCTION app.locais_sync_obra();

CREATE OR REPLACE FUNCTION app.obras_base_sync_local()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(current_setting('app.sync_local', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  PERFORM set_config('app.sync_local', '1', true);
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.locais WHERE id = OLD.id AND nivel = 1 AND pai_id IS NULL;
    PERFORM set_config('app.sync_local', '', true);
    RETURN OLD;
  END IF;
  INSERT INTO public.locais (id, empresa_id, pai_id, nivel, tipo, codigo, nome, ativo, extras)
  VALUES (NEW.id, NEW.empresa_id, NULL, 1, 'obra', NEW.codigo, NEW.nome, NEW.ativa, '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET codigo = EXCLUDED.codigo,
        nome = EXCLUDED.nome,
        ativo = EXCLUDED.ativo,
        empresa_id = EXCLUDED.empresa_id;
  PERFORM set_config('app.sync_local', '', true);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS obras_base_sync_local ON public.obras_base;
CREATE TRIGGER obras_base_sync_local
  AFTER INSERT OR UPDATE OR DELETE ON public.obras_base
  FOR EACH ROW
  EXECUTE FUNCTION app.obras_base_sync_local();

-- ---------------------------------------------------------------------------
-- Termos padrão. Chave que a empresa já gravou fica. O front lê isto.
-- ---------------------------------------------------------------------------
UPDATE public.empresas
SET termos = jsonb_build_object(
      'local.nivel1', 'Obra',
      'local.nivel2', 'Frente',
      'local.nivel1.plural', 'Obras',
      'ativo', 'Equipamento',
      'ativo.plural', 'Equipamentos',
      'os', 'Ordem de Serviço'
    ) || coalesce(termos, '{}'::jsonb);

INSERT INTO public.locais_niveis (empresa_id, nivel, termo)
SELECT e.id, 1, coalesce(e.termos->>'local.nivel1', 'Obra')
FROM public.empresas e
ON CONFLICT (empresa_id, nivel) DO NOTHING;

INSERT INTO public.locais_niveis (empresa_id, nivel, termo)
SELECT e.id, 2, coalesce(e.termos->>'local.nivel2', 'Frente')
FROM public.empresas e
ON CONFLICT (empresa_id, nivel) DO NOTHING;

-- ---------------------------------------------------------------------------
-- app.local_ok substitui a regra de app.obra_ok e continua a chamar app.pode.
-- nucleo.todos_locais ainda não está no catálogo: a chamada devolve falso e
-- admin, engenheiro e gestor seguem vendo tudo, como hoje. Local de outra
-- empresa não passa, mesmo que o uuid esteja em obras_permitidas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.local_ok(p_local uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis_usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND coalesce(u.ativo, true)
      AND (
        p_local IS NULL
        OR (
          (
            NOT EXISTS (SELECT 1 FROM public.locais l WHERE l.id = p_local)
            OR EXISTS (
              SELECT 1 FROM public.locais l
              WHERE l.id = p_local AND l.empresa_id = u.empresa_id
            )
          )
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(coalesce(u.cargos_lista, '[]'::jsonb)) c
              WHERE lower(btrim(c)) IN ('admin', 'engenheiro', 'gestor')
            )
            OR app.pode('nucleo.todos_locais')
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                CASE
                  WHEN u.obras_permitidas IS NULL OR u.obras_permitidas = '[]'::jsonb
                  THEN '["TODAS"]'::jsonb
                  ELSE u.obras_permitidas
                END
              ) o
              WHERE o = 'TODAS'
                 OR o = p_local::text
                 OR o = (
                   SELECT l.codigo
                   FROM public.locais l
                   WHERE l.id = p_local AND l.empresa_id = u.empresa_id
                 )
                 OR EXISTS (
                   SELECT 1
                   FROM public.locais alvo
                   JOIN public.locais lib
                     ON lib.empresa_id = alvo.empresa_id
                    AND alvo.caminho LIKE lib.caminho || '%'
                   WHERE alvo.id = p_local
                     AND alvo.empresa_id = u.empresa_id
                     AND (o = lib.id::text OR o = lib.codigo)
                 )
            )
          )
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION app.obra_ok(p_obra uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT app.local_ok(p_obra)
$function$;

REVOKE ALL ON FUNCTION app.local_ok(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.local_ok(uuid) TO authenticated;
REVOKE ALL ON FUNCTION app.obra_ok(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.obra_ok(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tipos de ativo. H e KM nascem para toda empresa. Outra unidade vira tipo
-- com o próprio texto como nome.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tipos_ativo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT app.empresa_atual(),
  codigo text NOT NULL,
  nome text NOT NULL,
  categoria text NOT NULL,
  atributos jsonb NOT NULL DEFAULT '[]'::jsonb,
  medidores_padrao text[] NOT NULL DEFAULT ARRAY['H']::text[]
);
ALTER TABLE public.tipos_ativo ADD COLUMN IF NOT EXISTS empresa_id uuid;
ALTER TABLE public.tipos_ativo ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.tipos_ativo ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.tipos_ativo ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.tipos_ativo ADD COLUMN IF NOT EXISTS atributos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.tipos_ativo ADD COLUMN IF NOT EXISTS medidores_padrao text[] DEFAULT ARRAY['H']::text[];
ALTER TABLE public.tipos_ativo ALTER COLUMN empresa_id SET DEFAULT app.empresa_atual();
ALTER TABLE public.tipos_ativo ALTER COLUMN atributos SET DEFAULT '[]'::jsonb;
ALTER TABLE public.tipos_ativo ALTER COLUMN medidores_padrao SET DEFAULT ARRAY['H']::text[];

UPDATE public.tipos_ativo SET atributos = '[]'::jsonb WHERE atributos IS NULL;
UPDATE public.tipos_ativo SET medidores_padrao = ARRAY['H']::text[] WHERE medidores_padrao IS NULL;
ALTER TABLE public.tipos_ativo ALTER COLUMN atributos SET NOT NULL;
ALTER TABLE public.tipos_ativo ALTER COLUMN medidores_padrao SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tipos_ativo_empresa_id_fkey' AND conrelid = 'public.tipos_ativo'::regclass
  ) THEN
    ALTER TABLE public.tipos_ativo
      ADD CONSTRAINT tipos_ativo_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tipos_ativo_empresa_codigo_key' AND conrelid = 'public.tipos_ativo'::regclass
  ) THEN
    ALTER TABLE public.tipos_ativo
      ADD CONSTRAINT tipos_ativo_empresa_codigo_key UNIQUE (empresa_id, codigo);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tipos_ativo_categoria_chk' AND conrelid = 'public.tipos_ativo'::regclass
  ) THEN
    ALTER TABLE public.tipos_ativo
      ADD CONSTRAINT tipos_ativo_categoria_chk CHECK (
        categoria IN (
          'maquina_pesada', 'veiculo', 'linha_producao', 'maquina_fixa',
          'predio', 'ferramenta', 'outro'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tipos_ativo_empresa_id_idx ON public.tipos_ativo (empresa_id);

INSERT INTO public.tipos_ativo (empresa_id, codigo, nome, categoria, atributos, medidores_padrao)
SELECT e.id, 'MAQUINA_PESADA', 'Máquina pesada (H)', 'maquina_pesada', '[]'::jsonb, ARRAY['H']::text[]
FROM public.empresas e
ON CONFLICT (empresa_id, codigo) DO NOTHING;

INSERT INTO public.tipos_ativo (empresa_id, codigo, nome, categoria, atributos, medidores_padrao)
SELECT e.id, 'VEICULO', 'Veículo (KM)', 'veiculo', '[]'::jsonb, ARRAY['KM']::text[]
FROM public.empresas e
ON CONFLICT (empresa_id, codigo) DO NOTHING;

INSERT INTO public.tipos_ativo (empresa_id, codigo, nome, categoria, atributos, medidores_padrao)
SELECT DISTINCT
  eq.empresa_id,
  'UN_' || upper(btrim(eq.unidade_medida)),
  btrim(eq.unidade_medida),
  'outro',
  '[]'::jsonb,
  ARRAY[upper(btrim(eq.unidade_medida))]::text[]
FROM public.equipamentos eq
WHERE upper(btrim(coalesce(eq.unidade_medida, ''))) NOT IN ('', 'H', 'KM')
ON CONFLICT (empresa_id, codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Colunas novas em equipamentos. obra_id continua: as FKs antigas apontam
-- para obras_base. local_id aponta para locais e o trigger mantém os dois.
-- ---------------------------------------------------------------------------
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS tipo_ativo_id uuid;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS atributos jsonb;
UPDATE public.equipamentos SET atributos = '{}'::jsonb WHERE atributos IS NULL;
ALTER TABLE public.equipamentos ALTER COLUMN atributos SET DEFAULT '{}'::jsonb;
ALTER TABLE public.equipamentos ALTER COLUMN atributos SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipamentos_tipo_ativo_id_fkey' AND conrelid = 'public.equipamentos'::regclass
  ) THEN
    ALTER TABLE public.equipamentos
      ADD CONSTRAINT equipamentos_tipo_ativo_id_fkey
      FOREIGN KEY (tipo_ativo_id) REFERENCES public.tipos_ativo(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipamentos_local_id_fkey' AND conrelid = 'public.equipamentos'::regclass
  ) THEN
    ALTER TABLE public.equipamentos
      ADD CONSTRAINT equipamentos_local_id_fkey
      FOREIGN KEY (local_id) REFERENCES public.locais(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS equipamentos_tipo_ativo_id_idx ON public.equipamentos (tipo_ativo_id);
CREATE INDEX IF NOT EXISTS equipamentos_local_id_idx ON public.equipamentos (local_id);

CREATE OR REPLACE FUNCTION app.equipamentos_sync_local()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_local uuid;
  v_obra uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.local_id IS NOT DISTINCT FROM OLD.local_id
     AND NEW.obra_id IS NOT DISTINCT FROM OLD.obra_id THEN
    RETURN NEW;
  END IF;
  -- ON DELETE SET NULL de um dos dois não apaga o outro.
  IF TG_OP = 'UPDATE'
     AND NEW.local_id IS NULL
     AND OLD.local_id IS NOT NULL
     AND NEW.obra_id IS NOT DISTINCT FROM OLD.obra_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.obra_id IS NULL
     AND OLD.obra_id IS NOT NULL
     AND NEW.local_id IS NOT DISTINCT FROM OLD.local_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_local := coalesce(NEW.local_id, NEW.obra_id);
  ELSIF NEW.local_id IS DISTINCT FROM OLD.local_id
        AND NEW.obra_id IS NOT DISTINCT FROM OLD.obra_id THEN
    v_local := NEW.local_id;
  ELSIF NEW.obra_id IS DISTINCT FROM OLD.obra_id
        AND NEW.local_id IS NOT DISTINCT FROM OLD.local_id THEN
    v_local := NEW.obra_id;
  ELSE
    v_local := coalesce(NEW.local_id, NEW.obra_id);
  END IF;

  IF v_local IS NULL THEN
    NEW.local_id := NULL;
    NEW.obra_id := NULL;
    RETURN NEW;
  END IF;

  SELECT raiz.id INTO v_obra
  FROM public.locais alvo
  JOIN public.locais raiz
    ON raiz.empresa_id = alvo.empresa_id
   AND raiz.nivel = 1
   AND alvo.caminho LIKE raiz.caminho || '%'
  WHERE alvo.id = v_local
  ORDER BY length(raiz.caminho) DESC
  LIMIT 1;

  IF v_obra IS NULL THEN
    NEW.local_id := v_local;
    NEW.obra_id := v_local;
    RETURN NEW;
  END IF;

  NEW.local_id := v_local;
  NEW.obra_id := v_obra;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS equipamentos_sync_local ON public.equipamentos;
CREATE TRIGGER equipamentos_sync_local
  BEFORE INSERT OR UPDATE OF obra_id, local_id ON public.equipamentos
  FOR EACH ROW
  EXECUTE FUNCTION app.equipamentos_sync_local();

UPDATE public.equipamentos eq
SET local_id = eq.obra_id
WHERE eq.local_id IS NULL
  AND eq.obra_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.locais l WHERE l.id = eq.obra_id);

UPDATE public.equipamentos eq
SET tipo_ativo_id = t.id
FROM public.tipos_ativo t
WHERE eq.tipo_ativo_id IS NULL
  AND t.empresa_id = eq.empresa_id
  AND t.codigo = CASE
    WHEN upper(btrim(coalesce(eq.unidade_medida, 'H'))) IN ('', 'H') THEN 'MAQUINA_PESADA'
    WHEN upper(btrim(eq.unidade_medida)) = 'KM' THEN 'VEICULO'
    ELSE 'UN_' || upper(btrim(eq.unidade_medida))
  END;

CREATE OR REPLACE VIEW public.ativos
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.empresa_id,
  e.tag,
  e.nome,
  e.marca,
  e.modelo,
  e.unidade_medida,
  e.horimetro_atual,
  e.km_atual,
  e.obra_id,
  e.local_id,
  e.tipo_ativo_id,
  e.atributos,
  e.propriedade,
  e.situacao_ciclo,
  e.numero_serie,
  e.placa,
  e.ano_fabricacao,
  e.horimetro_atualizado_em,
  e.km_atualizado_em,
  t.codigo AS tipo_codigo,
  t.nome AS tipo_nome,
  t.categoria AS tipo_categoria,
  l.codigo AS local_codigo,
  l.nome AS local_nome,
  l.caminho AS local_caminho
FROM public.equipamentos e
LEFT JOIN public.tipos_ativo t
  ON t.id = e.tipo_ativo_id
 AND t.empresa_id = e.empresa_id
LEFT JOIN public.locais l
  ON l.id = e.local_id
 AND l.empresa_id = e.empresa_id;

ALTER VIEW public.ativos SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- RLS no mesmo espírito da 0001 (perfil ativo) e da 0003 (empresa da sessão).
-- A policy antiga de obras continua em obras_base. Aqui só nascem policies novas.
-- ---------------------------------------------------------------------------
ALTER TABLE public.locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locais_niveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_ativo ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'locais_empresa' AND polrelid = 'public.locais'::regclass
  ) THEN
    CREATE POLICY locais_empresa ON public.locais
      AS PERMISSIVE FOR ALL TO authenticated
      USING (
        (SELECT app.perfil_ativo())
        AND empresa_id = (SELECT app.empresa_atual())
      )
      WITH CHECK (
        (SELECT app.perfil_ativo())
        AND empresa_id = (SELECT app.empresa_atual())
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'locais_niveis_empresa' AND polrelid = 'public.locais_niveis'::regclass
  ) THEN
    CREATE POLICY locais_niveis_empresa ON public.locais_niveis
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (
        (SELECT app.perfil_ativo())
        AND empresa_id = (SELECT app.empresa_atual())
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'tipos_ativo_empresa' AND polrelid = 'public.tipos_ativo'::regclass
  ) THEN
    CREATE POLICY tipos_ativo_empresa ON public.tipos_ativo
      AS PERMISSIVE FOR ALL TO authenticated
      USING (
        (SELECT app.perfil_ativo())
        AND empresa_id = (SELECT app.empresa_atual())
      )
      WITH CHECK (
        (SELECT app.perfil_ativo())
        AND empresa_id = (SELECT app.empresa_atual())
      );
  END IF;
END $$;

REVOKE ALL ON TABLE public.locais, public.locais_niveis, public.tipos_ativo, public.obras, public.ativos
  FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.locais, public.tipos_ativo, public.obras TO authenticated;
GRANT SELECT ON TABLE public.locais_niveis, public.ativos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.locais, public.locais_niveis, public.tipos_ativo, public.obras, public.ativos
  TO service_role;

REVOKE ALL ON FUNCTION app.locais_caminho() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app.obras_view_io() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app.locais_sync_obra() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app.obras_base_sync_local() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app.equipamentos_sync_local() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.locais_caminho() TO authenticated;
GRANT EXECUTE ON FUNCTION app.obras_view_io() TO authenticated;
GRANT EXECUTE ON FUNCTION app.locais_sync_obra() TO authenticated;
GRANT EXECUTE ON FUNCTION app.obras_base_sync_local() TO authenticated;
GRANT EXECUTE ON FUNCTION app.equipamentos_sync_local() TO authenticated;

INSERT INTO public.migracoes_aplicadas (escopo, modulo_id, arquivo, checksum, aplicado_por)
VALUES ('plataforma', NULL, '0004_locais_ativos.sql', md5('0004_locais_ativos.sql'), current_user)
ON CONFLICT (escopo, arquivo) DO NOTHING;

DO $$ BEGIN
  IF (
    SELECT c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'obras'
  ) IS DISTINCT FROM 'v' THEN
    RAISE EXCEPTION 'public.obras não ficou como view';
  END IF;
  IF to_regclass('public.obras_base') IS NULL OR to_regclass('public.ativos') IS NULL THEN
    RAISE EXCEPTION 'Faltou obras_base ou a view ativos';
  END IF;
  IF has_table_privilege('anon', 'public.locais', 'SELECT')
     OR has_table_privilege('anon', 'public.obras', 'SELECT')
     OR has_table_privilege('anon', 'public.ativos', 'SELECT')
     OR has_table_privilege('anon', 'public.tipos_ativo', 'SELECT')
     OR has_function_privilege('anon', 'app.local_ok(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ficou com privilégio em locais, obras, ativos ou app.local_ok';
  END IF;
  IF position('app.pode' in pg_get_functiondef('app.local_ok(uuid)'::regprocedure)) = 0
     OR position('app.local_ok' in pg_get_functiondef('app.obra_ok(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'app.local_ok ou app.obra_ok não ficaram coerentes com app.pode';
  END IF;
END $$;
