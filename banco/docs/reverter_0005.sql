-- Conferência da reversão da 0005. Só leitura (RAISE se divergir).
-- Roda logo depois de reverter/0005_offline_qr_reverter.sql (scripts/testar-sql-local.sh).
DO $$
BEGIN
  IF to_regprocedure('public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'reversão da 0005: os_abrir_pelo_qr ainda existe';
  END IF;
  IF to_regprocedure('app.versao_minima_app(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'reversão da 0005: app.versao_minima_app ainda existe';
  END IF;
  IF to_regclass('public.configuracoes_plataforma') IS NOT NULL THEN
    RAISE EXCEPTION 'reversão da 0005: configuracoes_plataforma ainda existe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'versao_minima_app'
  ) THEN
    RAISE EXCEPTION 'reversão da 0005: empresas.versao_minima_app ainda existe';
  END IF;
  IF EXISTS (SELECT 1 FROM public.migracoes_aplicadas WHERE arquivo = '0005_offline_qr.sql') THEN
    RAISE EXCEPTION 'reversão da 0005: o registro em migracoes_aplicadas ficou';
  END IF;
  IF position('versao_minima_app' in pg_get_functiondef('public.meu_perfil()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'reversão da 0005: meu_perfil ainda devolve versao_minima_app';
  END IF;
  IF position('modulos_ativos' in pg_get_functiondef('public.qr_equipamento(uuid, text)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'reversão da 0005: qr_equipamento ainda devolve modulos_ativos';
  END IF;
  -- O que já existia antes da reversão continua lá.
  IF NOT EXISTS (SELECT 1 FROM public.ordens_servico WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') THEN
    RAISE EXCEPTION 'reversão da 0005: a OS aberta antes sumiu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.equipamentos WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') THEN
    RAISE EXCEPTION 'reversão da 0005: o equipamento da semente sumiu';
  END IF;
END $$;
