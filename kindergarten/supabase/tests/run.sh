#!/usr/bin/env bash
# اجرای مهاجرت‌ها و تست‌های قواعد روی یک پستگرس موقت.
#
#   ./supabase/tests/run.sh
#
# نیازمند postgresql-16. هیچ داده‌ای از محیط شما را دست نمی‌زند؛ خوشه
# موقت در PGROOT ساخته و در پایان رها می‌شود.
set -euo pipefail

PGROOT="${PGROOT:-/var/tmp/kg-pgtest}"
PGPORT="${PGPORT:-5433}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$PGBIN:$PATH"

# پستگرس اجازه اجرا با کاربر ریشه نمی‌دهد. در ظرف‌هایی که کاربر ریشه‌اند
# (مثل CI) به یک کاربر بی‌امتیاز افت می‌کنیم، وگرنه اسکریپت همین‌طور
# پیش می‌رود.
if [ "$(id -u)" -eq 0 ]; then
  RUNNER="${PGRUNNER:-kgtest}"
  id -u "$RUNNER" >/dev/null 2>&1 || useradd -m "$RUNNER"
  mkdir -p "$PGROOT"
  chown -R "$RUNNER" "$PGROOT"
  exec su "$RUNNER" -c "PATH='$PATH' PGROOT='$PGROOT' PGPORT='$PGPORT' PGBIN='$PGBIN' bash '${BASH_SOURCE[0]}'"
fi

psql_kg() { psql -h "$PGROOT/sock" -p "$PGPORT" -U postgres -d kg -v ON_ERROR_STOP=1 "$@"; }

echo "▸ برپایی خوشه موقت"
pg_ctl -D "$PGROOT/data" stop -m immediate >/dev/null 2>&1 || true
rm -rf "$PGROOT"
mkdir -p "$PGROOT/data" "$PGROOT/sock"
initdb -D "$PGROOT/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$PGROOT/data" -o "-k $PGROOT/sock -p $PGPORT -c listen_addresses=''" \
       -l "$PGROOT/pg.log" start >/dev/null
trap 'pg_ctl -D "$PGROOT/data" stop -m immediate >/dev/null 2>&1 || true' EXIT

psql -h "$PGROOT/sock" -p "$PGPORT" -U postgres -q -c 'create database kg;'
psql_kg -q -c 'create extension if not exists pgcrypto;'

# Supabase شِمای auth را خودش دارد. اینجا حداقلِ لازم شبیه‌سازی می‌شود تا
# مهاجرت‌ها همان‌طور که در Supabase اجرا می‌شوند اجرا شوند.
psql_kg -q <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, phone text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
SQL

echo "▸ اجرای مهاجرت‌ها"
for f in "$HERE"/supabase/migrations/*.sql; do
  psql_kg -q -f "$f"
  echo "  $(basename "$f")"
done

run_suite() {
  local file="$1" label="$2"
  echo ""
  echo "▸ $label"
  psql -h "$PGROOT/sock" -p "$PGPORT" -U postgres -q -d kg \
    -c 'drop schema public cascade; create schema public; drop schema if exists app cascade;' >/dev/null 2>&1
  for f in "$HERE"/supabase/migrations/*.sql; do psql_kg -q -f "$f"; done
  psql_kg -f "$file" 2>&1 | grep -E '✓|ERROR|رد شد' || true
}

run_suite "$HERE/supabase/tests/rules.sql" "قواعد سفت سند"
run_suite "$HERE/supabase/tests/rls.sql" "ماتریس دسترسی"
echo ""
echo "تمام."
