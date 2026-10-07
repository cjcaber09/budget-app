#!/usr/bin/env bash
# Live test of the account-deletion cleanup path for receipt OCR files.
#
# Verifies: the purge route rejects a wrong secret (401) and a bad userId (400), refuses
# to purge a live account (409, files untouched), and that deleting an auth user fires
# the on_auth_user_deleted_ocr_cleanup trigger, which purges the user's files via pg_net.
#
# Prerequisites: .env with EXPO_PUBLIC_SUPABASE_URL and EXPO_SUPABASE_ACCESS_TOKEN; the
# project linked; migrations applied; the `ocr` function deployed with OCR_WEBHOOK_SECRET
# set, and the matching Vault secret `budget_tracker_ocr_webhook_secret` present.
# Throwaway user ocrtest-c-*@${OCR_TEST_EMAIL_DOMAIN:-example.com}.
#
# Cost: no OCR provider calls; one throwaway user is created and deleted.
# Never prints secrets (token, keys, webhook secret stay in shell variables).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
BUCKET=budget-tracker-ocr
DOMAIN=${OCR_TEST_EMAIL_DOMAIN:-example.com}
export SUPABASE_ACCESS_TOKEN=$(grep EXPO_SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
URL=$(grep EXPO_PUBLIC_SUPABASE_URL .env | cut -d= -f2)
REF=${URL#https://}; REF=${REF%%.*}
SERVICE=$(curl -s "https://api.supabase.com/v1/projects/$REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | node -e "
  const keys = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const k = keys.find(k => k.name === 'service_role') ?? keys.find(k => k.type === 'secret');
  process.stdout.write(k.api_key);")
FAILED=0
check() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (expected '$3', got '$2')"; FAILED=1; fi; }
sql() { npx supabase db query --linked "$1" 2>&1 | node -e "
  const s = require('fs').readFileSync(0, 'utf8'); const j = JSON.parse(s.slice(s.indexOf('{')));
  process.stdout.write(String(Object.values((j.rows || [])[0] || {})[0] ?? ''));"; }
SECRET=$(sql "select decrypted_secret from vault.decrypted_secrets where name = 'budget_tracker_ocr_webhook_secret';")
purge() { curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/ocr" -H "Content-Type: application/json" \
  -H "x-ocr-webhook-secret: $1" -d "$2"; }

check "wrong secret -> 401" "$(purge wrong-secret '{"userId":"3f8a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b"}')" "401"
check "right secret, bad userId -> 400" "$(purge "$SECRET" '{"userId":"nope"}')" "400"

USER_C=$(curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"ocrtest-c-$(date +%s)@$DOMAIN\",\"password\":\"Test1234!ocr\",\"email_confirm\":true}" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).id)")
# Safety net if the script aborts early; harmless once the user is already deleted.
trap 'curl -s -o /dev/null -X DELETE "$URL/auth/v1/admin/users/$USER_C" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"' EXIT
for f in a b; do
  curl -s -o /dev/null -X POST "$URL/storage/v1/object/$BUCKET/$USER_C/$f.txt" -H "apikey: $SERVICE" \
    -H "Authorization: Bearer $SERVICE" -H "Content-Type: text/plain" --data-binary "file $f"
done
check "files present before delete" "$(sql "select count(*) from storage.objects where bucket_id = '$BUCKET' and name like '$USER_C/%';")" "2"
check "purge of a live account -> 409" "$(purge "$SECRET" "{\"userId\":\"$USER_C\"}")" "409"
check "live account's files untouched" "$(sql "select count(*) from storage.objects where bucket_id = '$BUCKET' and name like '$USER_C/%';")" "2"

curl -s -o /dev/null -X DELETE "$URL/auth/v1/admin/users/$USER_C" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"
REMAINING=2
for i in $(seq 1 20); do
  REMAINING=$(sql "select count(*) from storage.objects where bucket_id = '$BUCKET' and name like '$USER_C/%';")
  [ "$REMAINING" = "0" ] && break
  sleep 1
done
check "account delete purged files" "$REMAINING" "0"
check "pg_net call succeeded" "$(sql "select status_code from net._http_response order by created desc limit 1;")" "200"

if [ "$FAILED" = "0" ]; then echo "ALL CLEANUP CHECKS PASSED"; else echo "SOME CLEANUP CHECKS FAILED"; fi
echo "USER_C=$USER_C"
