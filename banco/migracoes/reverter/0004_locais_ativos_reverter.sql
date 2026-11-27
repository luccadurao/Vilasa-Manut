-- =============================================================================
-- 0004_locais_ativos_reverter.sql — Vilasa-Manut
-- Desfaz a 0004 e devolve o banco ao estado da 0003.
-- Idempotente. psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
--
-- A view public.obras sai, e public.obras_base volta a se chamar public.obras.
-- A policy obras_autenticado_ativo segue na tabela: esta reversão não a apaga.
-- Os termos gravados em empresas.termos ficam. São rótulos, não estrutura.
-- As tabelas e colunas que a 0004 criou saem aqui, porque são o desfazer.
-- =============================================================================
SET search_path = '';

CREATE OR REPLACE FUNCTION app.obra_ok(p_obra uuid)
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
        p_obra IS NULL
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(u.cargos_lista) c
          WHERE lower(btrim(c)) IN ('admin', 'engenheiro', 'gestor')
        )
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
             OR o = p_obra::text
             OR o = (SELECT ob.codigo FROM public.obras ob WHERE ob.id = p_obra)
        )
      )
  )
$function$;

REVOKE ALL ON FUNCTION app.obra_ok(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.obra_ok(uuid) TO authenticated;

DROP TRIGGER IF EXISTS equipamentos_sync_local ON public.equipamentos;

DO $$
DECLARE
  kind "char";
BEGIN
  IF to_regclass('public.locais') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS locais_sync_obra ON public.locais;
    DROP TRIGGER IF EXISTS locais_caminho_biu ON public.locais;
  END IF;
  IF to_regclass('public.obras_base') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS obras_base_sync_local ON public.obras_base;
  END IF;
  SELECT c.relkind INTO kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'obras';
  IF kind = 'v' THEN
    DROP TRIGGER IF EXISTS obras_view_io ON public.obras;
    DROP VIEW public.obras;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ativos' AND c.relkind = 'v'
  ) THEN
    DROP VIEW public.ativos;
  END IF;
  IF to_regclass('public.obras') IS NULL AND to_regclass('public.obras_base') IS NOT NULL THEN
    ALTER TABLE public.obras_base RENAME TO obras;
  END IF;
END $$;

ALTER TABLE public.equipamentos DROP CONSTRAINT IF EXISTS equipamentos_tipo_ativo_id_fkey;
ALTER TABLE public.equipamentos DROP CONSTRAINT IF EXISTS equipamentos_local_id_fkey;
DROP INDEX IF EXISTS public.equipamentos_tipo_ativo_id_idx;
DROP INDEX IF EXISTS public.equipamentos_local_id_idx;
ALTER TABLE public.equipamentos DROP COLUMN IF EXISTS tipo_ativo_id;
ALTER TABLE public.equipamentos DROP COLUMN IF EXISTS local_id;
ALTER TABLE public.equipamentos DROP COLUMN IF EXISTS atributos;

DROP FUNCTION IF EXISTS app.local_ok(uuid);
DROP FUNCTION IF EXISTS app.equipamentos_sync_local();
DROP FUNCTION IF EXISTS app.obras_view_io();
DROP FUNCTION IF EXISTS app.locais_sync_obra();
DROP FUNCTION IF EXISTS app.obras_base_sync_local();
DROP FUNCTION IF EXISTS app.locais_caminho();

DROP TABLE IF EXISTS public.locais_niveis;
DROP TABLE IF EXISTS public.tipos_ativo;
DROP TABLE IF EXISTS public.locais;

DELETE FROM public.migracoes_aplicadas
WHERE escopo = 'plataforma' AND arquivo = '0004_locais_ativos.sql';
