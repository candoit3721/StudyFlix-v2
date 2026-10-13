#!/usr/bin/env bash
# Copy the production database's data (progress, visits, and the family
# sign-in account) into supabase/.snapshot/, so local previews have
# like-for-like data. Run it whenever you want fresher data:
#
#   scripts/db-snapshot.sh
#
# Needs the Supabase CLI logged in and linked once (see docs/supabase-sync.md).
# The snapshot holds the children's progress and the account's password hash:
# it is ignored by git and must never leave this computer.
set -euo pipefail

SUPABASE=(npx --yes supabase@2.120.0)
root="$(git rev-parse --show-toplevel)"
out="$root/supabase/.snapshot"
mkdir -p "$out"
chmod 700 "$out"
umask 077

echo "Dumping production data..."
"${SUPABASE[@]}" db dump --linked --data-only --schema public -f "$out/public.sql.tmp"

echo "Dumping the sign-in accounts..."
# Only accounts and identities: auth's own bookkeeping would clash with the
# local auth service, and sessions belong to real devices.
"${SUPABASE[@]}" db dump --linked --data-only --schema auth -f "$out/auth.sql.tmp" \
  -x auth.schema_migrations,auth.audit_log_entries,auth.sessions,auth.refresh_tokens,auth.flow_state,auth.mfa_amr_claims,auth.mfa_challenges,auth.one_time_tokens

mv "$out/public.sql.tmp" "$out/public.sql"
mv "$out/auth.sql.tmp" "$out/auth.sql"
date -u +%Y-%m-%dT%H:%M:%SZ > "$out/taken-at"
echo "Snapshot saved in $out ($(du -sh "$out" | cut -f1))."
