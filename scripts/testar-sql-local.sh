#!/bin/bash
# Sobe um Postgres local vazio e aplica 0000 a 0005.
# 0000 e 0001 vivem na branch do PR #2 (cursor/fase1-migracao-base-3e5d),
# porque ainda não estão nesta pilha. Não fala com o Supabase.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
ref="${REF_BASE:-origin/cursor/fase1-migracao-base-3e5d}"
tmp="$(mktemp -d)"
db="${PGDATABASE_TESTE:-vilasa_etapa6}"
export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGPORT="${PGPORT:-5432}"
if [ "$(id -un)" = "postgres" ]; then
  psql_cmd=(psql -h "$PGHOST" -p "$PGPORT")
else
  psql_cmd=(sudo -u postgres psql -h "$PGHOST" -p "$PGPORT")
fi

if ! git -C "$raiz" cat-file -e "${ref}:banco/migracoes/0000_base_producao_2026-11-24.sql" 2>/dev/null; then
  git -C "$raiz" fetch origin cursor/fase1-migracao-base-3e5d --depth=1
  ref="FETCH_HEAD"
fi

git -C "$raiz" show "${ref}:banco/migracoes/0000_base_producao_2026-11-24.sql" > "$tmp/0000.sql"
git -C "$raiz" show "${ref}:banco/migracoes/0001_seguranca_minima.sql" > "$tmp/0001.sql"
chmod 755 "$tmp"
chmod 644 "$tmp"/*.sql

"${psql_cmd[@]}" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${db};"
"${psql_cmd[@]}" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${db};"

"${psql_cmd[@]}" -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
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

"${psql_cmd[@]}" -d "$db" -v ON_ERROR_STOP=1 -f "$tmp/0000.sql"
"${psql_cmd[@]}" -d "$db" -v ON_ERROR_STOP=1 -f "$tmp/0001.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/migracoes/0002_plataforma_empresas_modulos.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/docs/testes_0002.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/migracoes/0003_empresa_id_em_tudo.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/docs/testes_0003.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/migracoes/0004_locais_ativos.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/docs/testes_0003.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/docs/testes_0004.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/migracoes/0005_offline_qr.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/migracoes/0005_offline_qr.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/docs/seed_ficticia_local.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/docs/testes_0004.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/docs/testes_0005.sql"

"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 <<'SQL'
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

if "${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true); SELECT public.os_abrir_pelo_qr('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'NAO PODE', 'X', 12, 'ALMOX', false, 'ffffffff-ffff-4fff-8fff-ffffffffffff');" >/tmp/vilasa-almox.out 2>/tmp/vilasa-almox.err; then
  echo "almoxarife abriu OS; isso não pode" >&2
  cat /tmp/vilasa-almox.err >&2
  exit 1
fi
if ! grep -q 'VM403' /tmp/vilasa-almox.err; then
  echo "o bloqueio do almoxarife não foi VM403" >&2
  cat /tmp/vilasa-almox.err >&2
  exit 1
fi

"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/migracoes/reverter/0005_offline_qr_reverter.sql"
"${psql_cmd[@]}" -d "$db" -tA -1 -v ON_ERROR_STOP=1 -c "SELECT to_regprocedure('public.os_abrir_pelo_qr(uuid, text, text, numeric, text, boolean, uuid)') IS NULL;" | grep -qx t
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/migracoes/0005_offline_qr.sql"
"${psql_cmd[@]}" -d "$db" -1 -v ON_ERROR_STOP=1 -f "$raiz/banco/docs/testes_0005.sql"
echo "sql local ok"
