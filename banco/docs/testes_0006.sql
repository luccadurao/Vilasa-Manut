-- =============================================================================
-- testes_0006.sql — conferência da 0006 (nome neutro), só leitura.
--   psql -1 -v ON_ERROR_STOP=1 -f banco/docs/testes_0006.sql
-- RAISE EXCEPTION se algo divergir. Simula a sessão com set_config local à
-- transação (some no fim); não grava nada.
-- =============================================================================
DO $$
DECLARE
  v_def text;
  r record;
  v_perfil jsonb;
BEGIN
  -- e-mail interno: sem nome de cliente, por empresa, matrícula vazia recusada
  IF app.email_interno('João da Silva', 'VILASA') <> 'joao.da.silva@vilasa.login.invalid' THEN
    RAISE EXCEPTION 'email_interno da empresa VILASA: %', app.email_interno('João da Silva', 'VILASA');
  END IF;
  IF app.email_interno('123', 'Agro Sul') <> '123@agro.sul.login.invalid' THEN
    RAISE EXCEPTION 'email_interno de outra empresa: %', app.email_interno('123', 'Agro Sul');
  END IF;
  IF app.email_interno('123', '') <> '123@empresa.login.invalid' THEN
    RAISE EXCEPTION 'email_interno sem código: %', app.email_interno('123', '');
  END IF;
  IF app.email_interno('  ', 'VILASA') <> app.dominio_login() THEN
    RAISE EXCEPTION 'email_interno com matrícula vazia precisa devolver app.dominio_login()';
  END IF;
  v_def := pg_get_functiondef('app.email_interno(text, text)'::regprocedure);
  IF position('vilasa' IN lower(v_def)) > 0 THEN
    RAISE EXCEPTION 'email_interno ainda cita o nome de um cliente';
  END IF;

  -- meu_perfil: locais_permitidos é o mesmo dado de obras_permitidas
  v_def := pg_get_functiondef('public.meu_perfil()'::regprocedure);
  IF position('locais_permitidos' IN v_def) = 0 OR position('obras_permitidas' IN v_def) = 0 THEN
    RAISE EXCEPTION 'meu_perfil precisa devolver locais_permitidos e obras_permitidas';
  END IF;
  IF position('versao_minima_app' IN v_def) = 0 OR position('permissoes' IN v_def) = 0 THEN
    RAISE EXCEPTION 'meu_perfil perdeu campo da 0005';
  END IF;
  FOR r IN
    SELECT auth_user_id, obras_permitidas FROM public.perfis_usuarios
    WHERE auth_user_id IS NOT NULL AND ativo IS NOT FALSE
    LIMIT 20
  LOOP
    PERFORM set_config('request.jwt.claim.sub', r.auth_user_id::text, true);
    v_perfil := public.meu_perfil();
    IF v_perfil IS NULL THEN
      RAISE EXCEPTION 'meu_perfil vazio para %', r.auth_user_id;
    END IF;
    IF (v_perfil -> 'locais_permitidos') IS DISTINCT FROM (v_perfil -> 'obras_permitidas')
       OR (v_perfil -> 'locais_permitidos') IS DISTINCT FROM to_jsonb(r.obras_permitidas) THEN
      RAISE EXCEPTION 'locais_permitidos divergiu de obras_permitidas para %', r.auth_user_id;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- sem sessão, meu_perfil não devolve ninguém
  IF public.meu_perfil() IS NOT NULL THEN
    RAISE EXCEPTION 'meu_perfil devolveu perfil sem sessão';
  END IF;

  -- privilégios
  IF has_function_privilege('anon', 'public.meu_perfil()', 'EXECUTE')
     OR has_function_privilege('anon', 'app.email_interno(text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.email_interno(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privilégio a mais em meu_perfil ou email_interno';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.meu_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated sem meu_perfil';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.migracoes_aplicadas WHERE arquivo = '0006_nome_neutro.sql') THEN
    RAISE EXCEPTION '0006 não registrada em migracoes_aplicadas';
  END IF;
END $$;

SELECT 'testes_0006 ok' AS resultado;
