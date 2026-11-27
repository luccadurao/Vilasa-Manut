-- =============================================================================
-- 0005_offline_qr_reverter.sql — Vilasa-Manut
-- Desfaz a 0005 e devolve meu_perfil e qr_equipamento ao texto da 0003.
-- Idempotente. psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
--
-- A tabela configuracoes_plataforma e a coluna empresas.versao_minima_app
-- saem aqui, porque são o desfazer. A migração para a frente não as apaga.
-- Não mexe em policy de tabela que já existia.
-- =============================================================================
SET search_path = '';

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

DROP FUNCTION IF EXISTS public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid);
DROP FUNCTION IF EXISTS app.versao_minima_app(uuid);

ALTER TABLE public.empresas DROP COLUMN IF EXISTS versao_minima_app;

DROP TABLE IF EXISTS public.configuracoes_plataforma;

DELETE FROM public.migracoes_aplicadas
WHERE escopo = 'plataforma' AND arquivo = '0005_offline_qr.sql';
