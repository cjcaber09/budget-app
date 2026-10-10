# CSV exports, Gmail recovery and account deletion

## Approved behavior

- Reports exports one analysis CSV for its selected month or twelve months ending there: monthly income/spending/net, category amounts/counts/shares, and separate payment-account amounts/counts/shares. Transfers, opening balances and corrections are excluded. Recorded future entries are included explicitly.
- Transactions has a separate export using the selected month, Income/Expenses filter and search. Its complete joined snapshot includes transaction date, amount, category, account, optional last four, income source, note and spending source, excluding receipt contents and sender identifiers.
- Forgot password starts only on Login. An emailed code is verified in a memory-only recovery client before choosing a new password. Existing signed-in Change password remains in Settings.
- Permanent deletion lives beside Settings' Sign Out actions. Current password and explicit acknowledgment initiate an owner-derived server operation. A lost response must not be interpreted as completion.

## Implementation

Migration 0023 adds `report_export_snapshot` and `transaction_export_snapshot`. Owner/profile/range validation, complete one-statement aggregates/joins, exact cent strings and envelope reconciliation prevent partial or inconsistent files. Dates use the saved financial timezone. Twelve-month exports before the supported reporting boundary are disabled. CSVs use UTF-8 BOM, CRLF, exact decimal amounts, escaping and formula protection; native sharing uses Expo FileSystem/Sharing and web uses Blob downloads. Temporary files are cleared after sharing, on account reset and at startup.

Gmail is configured in hosted Supabase with STARTTLS on port 587, matching sender/username and a Google App Password. Credentials remain in Supabase. The recovery template is `supabase/templates/recovery-code.html`. Hosted codes contain eight digits, expire after 3600 seconds, and retain server rate limiting. `EXPO_PUBLIC_AUTH_OTP_LENGTH` defaults to 8 and the deployment guard validates it. The form requires at least eight password characters and displays server password-policy errors. A password-save success is retained even if later session revocation fails.

Migration 0024 adds private durable deletion records, scan leases, authenticated-owner status, account-active write/upload guards and a five-minute cleanup worker. Records survive Auth deletion; completed records are swept and removed after 24 hours. Incomplete jobs remain retryable. Deletion waits for active scan leases and a two-minute settling period, clears all owned OCR/avatar Storage folders through the Storage API, deletes Auth and cascaded financial records, then confirms empty folders and Auth absence. Expired scan leases are cleaned after ten minutes. Existing post-deletion cleanup remains a fallback; recurring bills still use client-triggered preparation, not a scheduled cron.

Asymmetric JWTs are verified against the project's JWKS. Legacy JWTs use Supabase Auth while the account exists and PostgREST's signature-verified owner-status RPC after deletion. Unverifiable/expired tokens never prove completion. The client persists only owner/request identity and acceptance state, pauses financial interaction during deletion, shows an honest unconfirmed notice after session loss, and recovers owned pending operations after sign-in. Passwords never enter persistent storage. Local reminders are canceled on confirmed completion; other phones require their next sync.

## Deployment and checks

- `node scripts/deploy-mvp-account-exports.mjs` previews deployment after configured-project, Gmail, OTP, signing and Vault checks; `--apply` applies migrations and deploys OCR/account functions.
- `node scripts/mvp-auth-config.mjs --apply-template` updates only recovery subject/body, preserving SMTP credentials and unrelated Auth settings.
- `node scripts/mvp-exports-account-sql-test.mjs --deployed` runs rollback-only exact-total/1000+rows/owner/write/upload/deletion-status checks.
- `node scripts/mvp-account-live-test.mjs` uses throwaway users and synthetic files to verify exports, password recovery, deletion/leases, owner isolation, stale-token status and worker authentication. It sends no emails and makes no OCR/provider calls.
- `node scripts/mvp-send-recovery-test.mjs --email <approved-address>` sends one explicitly approved recovery email without changing its password.

Hosted migrations 0001–0024 are confirmed. The initial real recovery request failed because Gmail required an App Password; after the user corrected the SMTP password, the authorized retest succeeded and the user confirmed receipt of the eight-digit code. Hosted synthetic checks pass and all synthetic owners/files/operations were cleaned.

Jest, TypeScript, lint, Deno and production Hermes/web checks are recorded in `.superpowers/sdd/progress.md`. Synthetic phone-web review is limited to browser layout/interactions. Physical native sharing, keyboard, safe-area, accessibility and notification behavior still require device verification. Preserve existing DESIGN.md/design.json and all earlier uncommitted work. No commit or push is part of this task.
