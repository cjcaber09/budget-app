#!/usr/bin/env bash
# Live end-to-end test of the receipt-OCR backend (edge function + quota function + RLS).
#
# Verifies: auth/validation, a real scan, idempotent replay and same-image dedupe,
# empty scans not being reused (migration 0011), storage/RLS access rules, no bypass
# via PostgREST/Storage, stuck-row reconciliation, delete, the per-user hourly and
# global daily/monthly limits, and the quota function under concurrency.
#
# Prerequisites: .env with EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY and
# EXPO_SUPABASE_ACCESS_TOKEN; the project linked (`npx supabase link`); migrations
# applied (`npx supabase db push`); the `ocr` function deployed with a provider key.
# The sample receipt is git-ignored: supply your own with OCR_TEST_IMAGE and the text
# it should contain with OCR_TEST_EXPECT. Throwaway users use
# ocrtest-*@${OCR_TEST_EMAIL_DOMAIN:-example.com}; set the domain if the admin API rejects it.
#
# Cost: ONE real OCR provider call per run (free tier), plus throwaway users that are
# created and deleted. Never prints secrets (token, keys and JWTs stay in shell variables).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
WORK=$(mktemp -d); command -v cygpath >/dev/null 2>&1 && WORK=$(cygpath -m "$WORK")
BUCKET=budget-tracker-ocr
OCR_TEST_IMAGE=${OCR_TEST_IMAGE:-assets/images/sample-receipts/receipt1.jpg}
OCR_TEST_EXPECT=${OCR_TEST_EXPECT:-2,866.90}
export OCR_TEST_EXPECT
DOMAIN=${OCR_TEST_EMAIL_DOMAIN:-example.com}
if [ ! -f "$OCR_TEST_IMAGE" ]; then
  echo "Test image not found: $OCR_TEST_IMAGE" >&2
  echo "Sample receipts are git-ignored. Supply your own with OCR_TEST_IMAGE=<path> and OCR_TEST_EXPECT=<text it contains>." >&2
  rm -rf "$WORK"; exit 2
fi
case "${OCR_TEST_IMAGE##*.}" in
  jpg|jpeg|JPG|JPEG) MIME=image/jpeg; OTHER_MIME=image/png ;;
  png|PNG) MIME=image/png; OTHER_MIME=image/jpeg ;;
  webp|WEBP) MIME=image/webp; OTHER_MIME=image/jpeg ;;
  *) echo "Unsupported image extension: $OCR_TEST_IMAGE (use .jpg, .jpeg, .png or .webp)" >&2; rm -rf "$WORK"; exit 2 ;;
esac
export SUPABASE_ACCESS_TOKEN=$(grep EXPO_SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
URL=$(grep EXPO_PUBLIC_SUPABASE_URL .env | cut -d= -f2)
REF=${URL#https://}; REF=${REF%%.*}
ANON=$(grep EXPO_PUBLIC_SUPABASE_ANON_KEY .env | cut -d= -f2)
SERVICE=$(curl -s "https://api.supabase.com/v1/projects/$REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | node -e "
  const keys = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const k = keys.find(k => k.name === 'service_role') ?? keys.find(k => k.type === 'secret');
  process.stdout.write(k.api_key);")
FAILED=0
check() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (expected '$3', got '$2')"; FAILED=1; fi; }
field() { node -e "const j = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); process.stdout.write(String(($2)(j)))" "$1"; }
sql() { npx supabase db query --linked "$1" 2>&1 | node -e "
  const s = require('fs').readFileSync(0, 'utf8');
  const j = JSON.parse(s.slice(s.indexOf('{')));
  const v = Object.values((j.rows || [])[0] || {})[0];
  process.stdout.write(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));"; }
new_uuid() { node -e "process.stdout.write(require('crypto').randomUUID())"; }
TS=$(date +%s)
create_user() { curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"Test1234!ocr\",\"email_confirm\":true}" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).id)"; }
token_for() { curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$1\",\"password\":\"Test1234!ocr\"}" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).access_token)"; }
service_upload() { curl -s -o /dev/null -X POST "$URL/storage/v1/object/$BUCKET/$1" -H "apikey: $SERVICE" \
  -H "Authorization: Bearer $SERVICE" -H "Content-Type: text/plain" --data-binary "$2"; }
remove_folder() {
  local names; names=$(sql "select coalesce(json_agg(name), '[]'::json) from storage.objects where bucket_id = '$BUCKET' and name like '$1/%';")
  curl -s -o /dev/null -X DELETE "$URL/storage/v1/object/$BUCKET" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Type: application/json" -d "{\"prefixes\":$names}"
}
object_count() { sql "select count(*) from storage.objects where bucket_id = '$BUCKET' and name = '$1';"; }
EMAIL_A="ocrtest-a-$TS@$DOMAIN"; EMAIL_B="ocrtest-b-$TS@$DOMAIN"
USER_A=$(create_user "$EMAIL_A"); USER_B=$(create_user "$EMAIL_B")
cleanup() {
  remove_folder "$USER_A"; remove_folder "$USER_B"
  for u in "$USER_A" "$USER_B"; do
    curl -s -o /dev/null -X DELETE "$URL/auth/v1/admin/users/$u" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"
  done
  rm -rf "$WORK"
  echo "cleanup: test files and users deleted"
}
trap cleanup EXIT
TOKEN_A=$(token_for "$EMAIL_A"); TOKEN_B=$(token_for "$EMAIL_B")
count_a() { sql "select count(*) from budget_tracker.ocr_scans where user_id = '$USER_A';"; }
status_of() { sql "select status from budget_tracker.ocr_scans where id = '$1';"; }
invoke() { curl -s -o "$WORK/resp.json" -w "%{http_code}" -X "$2" "$URL/functions/v1/ocr" \
  -H "Authorization: Bearer $1" -H "apikey: $ANON" -H "Content-Type: application/json" --data-binary "$3"; }
payload() { # $1 mime, $2 requestId or "-" to omit -> path of a payload file
  node -e "
    const fs = require('fs'); const [dir, mime, rid] = process.argv.slice(1);
    const body = { imageBase64: fs.readFileSync(process.argv[4]).toString('base64'), mimeType: mime };
    if (rid !== '-') body.requestId = rid;
    fs.writeFileSync(dir + '/payload.json', JSON.stringify(body));" "$WORK" "$1" "$2" "$OCR_TEST_IMAGE"
  echo "@$WORK/payload.json"; }

R1=$(new_uuid)
# 1. Auth and validation
check "no token -> 401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/ocr" -d '{}')" "401"
check "web preflight allows DELETE + SDK headers" "$(curl -s -o /dev/null -D - -X OPTIONS "$URL/functions/v1/ocr" \
  -H 'Origin: http://localhost:8081' -H 'Access-Control-Request-Method: DELETE' \
  -H 'Access-Control-Request-Headers: authorization,x-client-info,apikey,content-type' \
  | grep -qiE '^access-control-allow-headers:.*x-client-info' && echo yes || echo no)" "yes"
check "missing requestId -> 400" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" -)")" "400"
check "type mismatch -> 400" "$(invoke "$TOKEN_A" POST "$(payload "$OTHER_MIME" "$R1")")" "400"
check "rejections consumed no quota" "$(count_a)" "0"
# 2. New scan (the only Vision call in this script)
check "real image -> 200" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$R1")")" "200"
check "text contains $OCR_TEST_EXPECT" "$(field "$WORK/resp.json" 'j => j.text.includes(process.env.OCR_TEST_EXPECT)')" "true"
check "not truncated" "$(field "$WORK/resp.json" 'j => j.truncated')" "false"
SCAN_1=$(field "$WORK/resp.json" 'j => j.scanId'); PATH_1="$USER_A/$SCAN_1.txt"
check "row completed" "$(status_of "$SCAN_1")" "completed"
check ".txt stored" "$(object_count "$PATH_1")" "1"
# 3. Idempotent replay: same requestId -> same result, no new row, no Vision call
check "replay -> 200" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$R1")")" "200"
check "replay same scanId" "$(field "$WORK/resp.json" 'j => j.scanId')" "$SCAN_1"
check "replay added no row" "$(count_a)" "1"
# 3b. Same image, new requestId (user re-picked the file) -> served from the saved .txt, no Vision call
check "same image -> 200" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$(new_uuid)")")" "200"
check "same image same scanId" "$(field "$WORK/resp.json" 'j => j.scanId')" "$SCAN_1"
check "same image added no row" "$(count_a)" "1"
# 4. Owner can sign + download; other user can't sign
curl -s -X POST "$URL/storage/v1/object/sign/$BUCKET/$PATH_1" -H "Authorization: Bearer $TOKEN_A" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d '{"expiresIn":60}' > "$WORK/sign.json"
check "owner download has text" "$(curl -s "$URL/storage/v1$(field "$WORK/sign.json" 'j => j.signedURL')" | grep -qF "$OCR_TEST_EXPECT" && echo yes || echo no)" "yes"
check "other user cannot sign" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/storage/v1/object/sign/$BUCKET/$PATH_1" \
  -H "Authorization: Bearer $TOKEN_B" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"expiresIn":60}' | grep -c '^200$')" "0"
# 5. No bypass via PostgREST or Storage
curl -s -o /dev/null -X DELETE "$URL/rest/v1/ocr_scans?user_id=eq.$USER_A" -H "Authorization: Bearer $TOKEN_A" \
  -H "apikey: $ANON" -H "Accept-Profile: budget_tracker" -H "Content-Profile: budget_tracker"
check "direct row delete blocked" "$(count_a)" "1"
check "direct rpc blocked" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/rest/v1/rpc/try_consume_ocr_quota" \
  -H "Authorization: Bearer $TOKEN_A" -H "apikey: $ANON" -H "Content-Profile: budget_tracker" -H "Content-Type: application/json" \
  -d "{\"p_user_id\":\"$USER_A\",\"p_request_id\":\"$(new_uuid)\",\"p_image_sha256\":\"test\"}" | grep -c '^200$')" "0"
check "direct rpc added no row" "$(count_a)" "1"
curl -s -o /dev/null -X DELETE "$URL/storage/v1/object/$BUCKET/$PATH_1" -H "Authorization: Bearer $TOKEN_A" -H "apikey: $ANON"
check "direct storage delete blocked" "$(object_count "$PATH_1")" "1"
# 6. Upload landed but status update failed -> replay completes it
sql "update budget_tracker.ocr_scans set status = 'pending' where id = '$SCAN_1';" >/dev/null
check "replay of stuck row -> 200" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$R1")")" "200"
check "stuck row now completed" "$(status_of "$SCAN_1")" "completed"
# 7. Same requestId still running (pending, no .txt) -> 409
R2=$(new_uuid)
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256) values ('$USER_A', '$R2', 'test');" >/dev/null
check "in progress -> 409" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$R2")")" "409"
# 8. Lazy reconciliation of rows stuck > 10 min (P1: no .txt, P2: .txt present)
P1=$(new_uuid); P2=$(new_uuid)
sql "insert into budget_tracker.ocr_scans (id, user_id, request_id, image_sha256, created_at) values ('$P1', '$USER_A', gen_random_uuid(), 'test', now() - interval '15 minutes'), ('$P2', '$USER_A', gen_random_uuid(), 'test', now() - interval '15 minutes');" >/dev/null
service_upload "$USER_A/$P2.txt" "reconciled text"
invoke "$TOKEN_A" POST "$(payload "$MIME" "$R1")" >/dev/null   # any call runs reconciliation first
check "stuck row without .txt -> failed" "$(status_of "$P1")" "failed"
check "stuck row with .txt -> completed" "$(status_of "$P2")" "completed"
# 9. Delete: works, is idempotent, and tolerates a missing file
check "other user cannot delete -> 404" "$(invoke "$TOKEN_B" DELETE "{\"scanId\":\"$SCAN_1\"}")" "404"
check "file kept after foreign delete" "$(object_count "$PATH_1")" "1"
check "delete -> 204" "$(invoke "$TOKEN_A" DELETE "{\"scanId\":\"$SCAN_1\"}")" "204"
check "file removed" "$(object_count "$PATH_1")" "0"
check "row kept as deleted" "$(status_of "$SCAN_1")" "deleted"
check "delete again -> 204" "$(invoke "$TOKEN_A" DELETE "{\"scanId\":\"$SCAN_1\"}")" "204"
check "replay of deleted -> 410" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$R1")")" "410"
remove_folder "$USER_A"   # P2's .txt vanishes out from under its 'completed' row
check "delete with missing file -> 204" "$(invoke "$TOKEN_A" DELETE "{\"scanId\":\"$P2\"}")" "204"
check "row marked deleted" "$(status_of "$P2")" "deleted"
# 10. Per-user hourly limit (5) -> 429 with no new row (A has 4 rows this hour; add 1).
#     SCAN_1 is deleted now, so the same image no longer dedupes and reaches the limits.
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256, status, created_at) select '$USER_A', gen_random_uuid(), 'test', 'completed', now() - interval '5 minutes' from generate_series(1, 1);" >/dev/null
check "user hourly -> 429" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$(new_uuid)")")" "429"
check "reason user_hourly" "$(field "$WORK/resp.json" 'j => j.reason')" "user_hourly"
check "429 added no row" "$(count_a)" "5"
# 11. Global daily limit (40): A back to 1 row, B gets 40
sql "delete from budget_tracker.ocr_scans where user_id = '$USER_A' and id <> '$SCAN_1';" >/dev/null
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256, status, created_at) select '$USER_B', gen_random_uuid(), 'test', 'completed', now() - interval '1 minute' from generate_series(1, 40);" >/dev/null
check "global daily -> 429" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$(new_uuid)")")" "429"
check "reason global_daily" "$(field "$WORK/resp.json" 'j => j.reason')" "global_daily"
# 11b. Free-tier monthly cap (900): checked first, so it wins even though the daily cap is also hit
sql "delete from budget_tracker.ocr_scans where user_id = '$USER_B';" >/dev/null
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256, status, created_at) select '$USER_B', gen_random_uuid(), 'test', 'completed', now() - interval '1 minute' from generate_series(1, 900);" >/dev/null
check "global monthly -> 429" "$(invoke "$TOKEN_A" POST "$(payload "$MIME" "$(new_uuid)")")" "429"
check "reason global_monthly" "$(field "$WORK/resp.json" 'j => j.reason')" "global_monthly"
check "waits until next PT month" "$(field "$WORK/resp.json" 'j => j.retryAfterSeconds > 0 && j.retryAfterSeconds <= 31 * 86400')" "true"
# 12. Concurrency: A at 4 this hour, 5 parallel new requests -> exactly 1 'new'
sql "delete from budget_tracker.ocr_scans where user_id = '$USER_B';" >/dev/null
sql "insert into budget_tracker.ocr_scans (user_id, request_id, image_sha256, status, created_at) select '$USER_A', gen_random_uuid(), 'test', 'completed', now() - interval '5 minutes' from generate_series(1, 3);" >/dev/null
for i in 1 2 3 4 5; do
  curl -s -X POST "$URL/rest/v1/rpc/try_consume_ocr_quota" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Profile: budget_tracker" -H "Content-Type: application/json" \
    -d "{\"p_user_id\":\"$USER_A\",\"p_request_id\":\"$(new_uuid)\",\"p_image_sha256\":\"concurrency-$i\"}" > "$WORK/rpc_$i.json" &
done
wait
check "concurrency: exactly 1 new" "$(cat "$WORK"/rpc_*.json | grep -o '"outcome":"new"' | wc -l | tr -d ' ')" "1"

# 13. Empty scans are not reused by same-image dedupe (migration 0011); no OCR call.
sql "delete from budget_tracker.ocr_scans where user_id = '$USER_A';" >/dev/null
E1=$(new_uuid); E2=$(new_uuid)
sql "insert into budget_tracker.ocr_scans (id, user_id, request_id, image_sha256, status, char_count) values ('$E1', '$USER_A', gen_random_uuid(), 'hash-empty', 'completed', 0), ('$E2', '$USER_A', gen_random_uuid(), 'hash-text', 'completed', 4);" >/dev/null
service_upload "$USER_A/$E1.txt" "text"
service_upload "$USER_A/$E2.txt" "text"
for h in empty text; do
  curl -s -X POST "$URL/rest/v1/rpc/try_consume_ocr_quota" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Profile: budget_tracker" -H "Content-Type: application/json" \
    -d "{\"p_user_id\":\"$USER_A\",\"p_request_id\":\"$(new_uuid)\",\"p_image_sha256\":\"hash-$h\"}" > "$WORK/dedupe_$h.json"
done
check "empty scan not reused -> new" "$(field "$WORK/dedupe_empty.json" 'j => j[0].outcome')" "new"
check "non-empty scan reused -> replay" "$(field "$WORK/dedupe_text.json" 'j => j[0].outcome')" "replay"

if [ "$FAILED" = "0" ]; then echo "ALL LIVE CHECKS PASSED"; else echo "SOME LIVE CHECKS FAILED"; fi
