-- Conferência da reversão da 0006. Só leitura (RAISE se divergir).
-- Roda logo depois de reverter/0006_nome_neutro_reverter.sql (scripts/testar-sql-local.sh).
DO $$
BEGIN
  IF position('locais_permitidos' IN pg_get_functiondef('public.meu_perfil()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'reversão da 0006: meu_perfil ainda devolve locais_permitidos';
  END IF;
  IF position('versao_minima_app' IN pg_get_functiondef('public.meu_perfil()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'reversão da 0006: meu_perfil precisava voltar ao texto da 0005';
  END IF;
  IF app.email_interno('joao', 'VILASA') <> 'joao' || app.dominio_login() THEN
    RAISE EXCEPTION 'reversão da 0006: email_interno não voltou ao texto da 0003';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.empresas
    WHERE termos ->> 'local.nivel1' = 'Obra' AND termos ? 'local.nivel1.genero'
  ) THEN
    RAISE EXCEPTION 'reversão da 0006: o gênero acrescentado aos termos ficou';
  END IF;
  IF EXISTS (SELECT 1 FROM public.migracoes_aplicadas WHERE arquivo = '0006_nome_neutro.sql') THEN
    RAISE EXCEPTION 'reversão da 0006: o registro em migracoes_aplicadas ficou';
  END IF;
  IF has_function_privilege('anon', 'public.meu_perfil()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.meu_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'reversão da 0006: privilégios de meu_perfil mudaram';
  END IF;
END $$;
