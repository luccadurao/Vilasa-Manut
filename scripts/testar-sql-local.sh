#!/bin/bash
# Sobe um banco Postgres vazio e testa todas as migrações de banco/migracoes/.
# Não fala com o Supabase: simula só o que o Supabase traz pronto
# (papéis anon/authenticated/service_role, auth.users e auth.uid()).
#
# Passos:
#   1. aplica 0000 → última, em ordem. A partir da 0002, cada migração é
#      aplicada duas vezes seguidas (tem que ser idempotente) e o
#      banco/docs/testes_NNNN.sql dela roda logo depois;
#   2. carrega a semente fictícia e roda de novo os testes de regressão
#      (todos, menos os marcados "-- teste: pontual");
#   3. simula login (JWT) e confere uma permissão liberada e uma negada;
#   4. reverte a última migração, confere a reversão, reaplica e testa.
#
# Conexão:
#   - padrão: Postgres local via socket, como usuário postgres (sudo);
#   - CI: defina PGHOST/PGPORT/PGUSER (e PGPASSWORD) e o script usa psql direto.
# O banco de teste é apagado e recriado: nunca aponte para um banco real.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
db="${PGDATABASE_TESTE:-plataforma_teste}"
export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGPORT="${PGPORT:-5432}"

case "$PGHOST" in
  *supabase.co*|*supabase.com*|*pooler*)
    echo "PGHOST aponta para o Supabase. Este script só roda em banco local." >&2
    exit 1
    ;;
esac

if [ -n "${PGUSER:-}" ] || [ "$(id -un)" = "postgres" ]; then
  psql_cmd=(psql -h "$PGHOST" -p "$PGPORT" -q)
else
  psql_cmd=(sudo -u postgres psql -h "$PGHOST" -p "$PGPORT" -q)
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
# Teste com a linha "-- teste: pontual" só vale logo depois da própria
# migração (uma migração seguinte muda o que ele confere). Fica fora das
# rodadas de regressão.
rodar_todos_os_testes() {
  local m t
  for m in "${migracoes[@]}"; do
    t="$(teste_de "$m")"
    if [ -n "$t" ] && ! grep -q '^-- teste: pontual' "$t"; then
      echo "   teste $(basename "$t")"
      sql -1 -f "$t"
    fi
  done
}

etapa "banco vazio: $db"
"${psql_cmd[@]}" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${db};"
"${psql_cmd[@]}" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${db};"

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
CREATE SCHEMA IF NOT EXISTS auth;
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
  echo "   aplica $(basename "$m")"
  # 0000 e 0001 vieram de um dump e não rodam numa transação só.
  if [ "$(numero_de "$m")" -le 1 ]; then
    sql -f "$m"
  else
    sql -1 -f "$m"
    echo "   reaplica $(basename "$m") (idempotência)"
    sql -1 -f "$m"
  fi
  t="$(teste_de "$m")"
  if [ -n "$t" ]; then
    echo "   teste $(basename "$t")"
    sql -1 -f "$t"
  fi
done

etapa "2. semente fictícia e testes de regressão"
sql -1 -f "$raiz/banco/docs/seed_ficticia_local.sql"
rodar_todos_os_testes

etapa "3. login simulado: mecânico abre OS, almoxarife recebe VM403"
sql -1 <<'SQL'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT public.os_abrir_pelo_qr(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'VAZAMENTO FICTICIO',
  'FRENTE 1',
  12,
  'MECANICO FICTICIO',
  true,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
) AS aberta;
SELECT public.os_abrir_pelo_qr(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'VAZAMENTO FICTICIO',
  'FRENTE 1',
  12,
  'MECANICO FICTICIO',
  true,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
) AS repetida;
SQL

saida_negada="$(mktemp)"
if sql -1 -c "SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true); SELECT public.os_abrir_pelo_qr('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'NAO PODE', 'X', 12, 'ALMOX', false, 'ffffffff-ffff-4fff-8fff-ffffffffffff');" >/dev/null 2>"$saida_negada"; then
  echo "almoxarife abriu OS; isso não pode" >&2
  cat "$saida_negada" >&2
  exit 1
fi
if ! grep -q 'VM403' "$saida_negada"; then
  echo "o bloqueio do almoxarife não foi VM403" >&2
  cat "$saida_negada" >&2
  exit 1
fi

ultima="${migracoes[${#migracoes[@]}-1]}"
reversao="$(reversao_de "$ultima")"
etapa "4. reversão da última migração: $(basename "$ultima")"
if [ -z "$reversao" ]; then
  echo "a última migração não tem arquivo em reverter/" >&2
  exit 1
fi
sql -1 -f "$reversao"
conferencia="$raiz/banco/docs/reverter_$(numero_de "$ultima").sql"
if [ -f "$conferencia" ]; then
  echo "   confere $(basename "$conferencia")"
  sql -1 -f "$conferencia"
fi
sql -1 -f "$ultima"
rodar_todos_os_testes

echo
echo "sql local ok"
