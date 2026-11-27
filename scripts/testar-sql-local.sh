#!/bin/bash
# Sobe um banco Postgres vazio e testa todas as migrações de banco/migracoes/.
# Não fala com o Supabase: simula só o que o Supabase traz pronto
# (papéis anon/authenticated/service_role, auth.users e auth.uid()).
#
# Passos:
#   1. aplica 0000 → última, em ordem. A partir da 0001, cada migração roda
#      numa transação só e é aplicada duas vezes seguidas (tem que ser
#      idempotente); o banco/docs/testes_NNNN.sql dela roda logo depois.
#      A partir da 0002, migração sem teste ou sem reversão é erro;
#   2. carrega a semente fictícia e roda de novo os testes de regressão
#      (todos, sem os trechos entre "-- pontual:inicio" e "-- pontual:fim",
#      que só valem logo depois da própria migração);
#   3. simula login (JWT, papel authenticated) e confere uma permissão
#      liberada, a idempotência da chamada, uma negada (VM403) e o anon barrado;
#   4. reverte a última migração duas vezes, confere a reversão
#      (banco/docs/reverter_NNNN.sql), reaplica duas vezes e testa.
#
# Conexão:
#   - padrão: Postgres local via socket, como usuário postgres (sudo);
#   - CI: defina PGHOST/PGPORT/PGUSER (e PGPASSWORD) e o script usa psql direto.
# Só aceita servidor local e banco com nome terminado em "_teste", porque o
# banco é apagado e recriado.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
db="${PGDATABASE_TESTE:-plataforma_teste}"
export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGPORT="${PGPORT:-5432}"
# Um serviço do libpq pode trazer um hostaddr remoto que o -h não sobrescreve.
unset PGSERVICE PGSERVICEFILE

# --- travas: só banco local e descartável ------------------------------------
case "$PGHOST" in
  /var/run/postgresql|/tmp|localhost|127.0.0.1|::1) ;;
  *)
    echo "PGHOST=$PGHOST não é local. Este script só roda em Postgres local." >&2
    exit 1
    ;;
esac
if [ -n "${PGHOSTADDR:-}" ] && [ "$PGHOSTADDR" != "127.0.0.1" ] && [ "$PGHOSTADDR" != "::1" ]; then
  echo "PGHOSTADDR=$PGHOSTADDR não é local." >&2
  exit 1
fi
if ! [[ "$db" =~ ^[a-z0-9_]+_teste$ ]]; then
  echo "PGDATABASE_TESTE=$db: o nome precisa terminar em _teste (só letras minúsculas, números e _)." >&2
  exit 1
fi

if [ -n "${PGUSER:-}" ] || [ "$(id -un)" = "postgres" ]; then
  psql_cmd=(psql -h "$PGHOST" -p "$PGPORT" -q)
else
  psql_cmd=(sudo -u postgres psql -h "$PGHOST" -p "$PGPORT" -q)
fi

# Um Supabase de verdade tem estes papéis; um Postgres de teste vazio, não.
papeis_supabase="$("${psql_cmd[@]}" -d postgres -tA -c "SELECT count(*) FROM pg_roles WHERE rolname IN ('supabase_admin', 'authenticator');")"
if [ "$papeis_supabase" != "0" ]; then
  echo "Este servidor tem papéis do Supabase. Recusado: só rode em Postgres de teste." >&2
  exit 1
fi

sql() { "${psql_cmd[@]}" -d "$db" -v ON_ERROR_STOP=1 "$@"; }
etapa() { printf '\n== %s\n' "$*"; }

mapfile -t migracoes < <(find "$raiz/banco/migracoes" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]_*.sql' | sort)
if [ "${#migracoes[@]}" -eq 0 ]; then
  echo "nenhuma migração encontrada" >&2
  exit 1
fi

numero_de() { basename "$1" | cut -c1-4; }
teste_de() {
  local t="$raiz/banco/docs/testes_$(numero_de "$1").sql"
  if [ -f "$t" ]; then echo "$t"; fi
}
reversao_de() {
  local base
  base="$(basename "$1" .sql)"
  local r="$raiz/banco/migracoes/reverter/${base}_reverter.sql"
  if [ -f "$r" ]; then echo "$r"; fi
}
# Roda o teste sem os trechos pontuais (marcadores em linha própria).
teste_de_regressao() {
  sed -E '/^[[:space:]]*-- pontual:inicio[[:space:]]*$/,/^[[:space:]]*-- pontual:fim[[:space:]]*$/d' "$1" | sql -1
}
rodar_testes_de_regressao() {
  local m t
  for m in "${migracoes[@]}"; do
    t="$(teste_de "$m")"
    if [ -n "$t" ]; then
      echo "   teste $(basename "$t")"
      teste_de_regressao "$t"
    fi
  done
}

etapa "banco vazio: $db"
"${psql_cmd[@]}" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${db}\";"
"${psql_cmd[@]}" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${db}\";"

sql <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT;
  END IF;
END $$;
-- No Supabase o postgres pode assumir esses papéis (SET ROLE).
GRANT anon, authenticated, service_role TO CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;
SQL

etapa "1. migrações em ordem"
for m in "${migracoes[@]}"; do
  n="$(numero_de "$m")"
  if [ "$n" = "0000" ]; then
    # 0000 é o dump do esquema da produção: não é idempotente nem roda
    # numa transação só (cria extensões e tipos).
    echo "   aplica $(basename "$m")"
    sql -f "$m"
    continue
  fi
  echo "   aplica $(basename "$m")"
  sql -1 -f "$m"
  echo "   reaplica $(basename "$m") (idempotência)"
  sql -1 -f "$m"
  t="$(teste_de "$m")"
  if [ "$((10#$n))" -ge 2 ]; then
    if [ -z "$t" ]; then
      echo "$(basename "$m") não tem banco/docs/testes_${n}.sql" >&2
      exit 1
    fi
    if [ -z "$(reversao_de "$m")" ]; then
      echo "$(basename "$m") não tem reversão em banco/migracoes/reverter/" >&2
      exit 1
    fi
  fi
  if [ -n "$t" ]; then
    echo "   teste $(basename "$t")"
    sql -1 -f "$t"
  fi
done

etapa "2. semente fictícia e testes de regressão"
sql -1 -f "$raiz/banco/docs/seed_ficticia_local.sql"
rodar_testes_de_regressao

etapa "3. login simulado: mecânico abre OS, almoxarife recebe VM403, anon é barrado"
sql -1 <<'SQL'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r1 jsonb;
  r2 jsonb;
BEGIN
  r1 := public.os_abrir_pelo_qr(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'VAZAMENTO FICTICIO', 'FRENTE 1', 12,
    'MECANICO FICTICIO', true, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  r2 := public.os_abrir_pelo_qr(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'VAZAMENTO FICTICIO', 'FRENTE 1', 12,
    'MECANICO FICTICIO', true, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  IF NOT coalesce((r1 ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'mecânico não abriu a OS: %', r1;
  END IF;
  IF NOT coalesce((r2 ->> 'repetido')::boolean, false) THEN
    RAISE EXCEPTION 'a segunda chamada com o mesmo id não voltou como repetida: %', r2;
  END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ordens_servico WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 1 THEN
    RAISE EXCEPTION 'a OS do QR precisava existir uma vez só';
  END IF;
END $$;
SQL

sql -1 <<'SQL'
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.os_abrir_pelo_qr(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'NAO PODE', 'X', 12, 'ALMOX', false,
    'ffffffff-ffff-4fff-8fff-ffffffffffff');
  RAISE EXCEPTION 'almoxarife abriu OS; isso não pode';
EXCEPTION
  WHEN SQLSTATE 'VM403' THEN NULL;
END $$;
SQL

sql -1 <<'SQL'
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.os_abrir_pelo_qr(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ANON', 'X', 12, 'ANON', false,
    'abababab-abab-4bab-8bab-abababababab');
  RAISE EXCEPTION 'anon abriu OS; isso não pode';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END $$;
SQL

ultima="${migracoes[${#migracoes[@]}-1]}"
reversao="$(reversao_de "$ultima")"
etapa "4. reversão da última migração: $(basename "$ultima")"
if [ -z "$reversao" ]; then
  echo "a última migração não tem arquivo em reverter/" >&2
  exit 1
fi
echo "   reverte (duas vezes)"
sql -1 -f "$reversao"
sql -1 -f "$reversao"
conferencia="$raiz/banco/docs/reverter_$(numero_de "$ultima").sql"
if [ -f "$conferencia" ]; then
  echo "   confere $(basename "$conferencia")"
  sql -1 -f "$conferencia"
fi
echo "   reaplica (duas vezes)"
sql -1 -f "$ultima"
sql -1 -f "$ultima"
rodar_testes_de_regressao

echo
echo "sql local ok"
