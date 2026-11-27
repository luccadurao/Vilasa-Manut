-- Conferência da reversão da 0005. Só leitura.
-- Roda logo depois de reverter/0005_offline_qr_reverter.sql (scripts/testar-sql-local.sh).
DO $$
BEGIN
  IF to_regprocedure('public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'reversão da 0005: os_abrir_pelo_qr ainda existe';
  END IF;
END $$;
