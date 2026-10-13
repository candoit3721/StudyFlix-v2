#!/usr/bin/env bash
# Serve this checkout for review against a local Supabase (Docker) with
# production-like data. The factory runs it as the profile's `preview`
# command in a job's worktree, with FACTORY_PORT set:
#
#   1. start the local Supabase stack (kept running between previews);
#   2. rebuild its database from THIS checkout's migrations, so a job's
#      schema change is tried before it reaches production;
#   3. load the production snapshot (scripts/db-snapshot.sh), if there is one;
#   4. build the site pointed at the local Supabase and serve it.
#
# A failing migration or snapshot load stops the preview, and the factory
# reports the end of this output (factory/jobs/<id>/preview.log).
set -euo pipefail

SUPABASE=(npx --yes supabase@2.120.0)
port="${FACTORY_PORT:?FACTORY_PORT is not set (run me through the factory, or set it)}"
main="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
snapshot="$main/supabase/.snapshot"
db_container="supabase_db_$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)"

echo "== Local Supabase"
"${SUPABASE[@]}" start

echo "== Database from this checkout's migrations"
"${SUPABASE[@]}" db reset --local --yes

if [ -f "$snapshot/public.sql" ]; then
  echo "== Production snapshot taken $(cat "$snapshot/taken-at")"
  # Accounts first: progress rows refer to them.
  for part in auth public; do
    docker exec -i "$db_container" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$snapshot/$part.sql"
  done
else
  echo "== No production snapshot: the database is empty."
  echo "   For like-for-like data, run scripts/db-snapshot.sh in $main once."
fi

eval "$("${SUPABASE[@]}" status -o env | grep -E '^(API_URL|ANON_KEY|PUBLISHABLE_KEY)=')"
export PUBLIC_SUPABASE_URL="$API_URL"
export PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}"

echo "== Building against $PUBLIC_SUPABASE_URL"
npm run build
exec npx astro preview --port "$port" --ignore-lock
