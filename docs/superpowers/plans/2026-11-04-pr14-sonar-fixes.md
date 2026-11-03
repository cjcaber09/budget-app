# PR 14 Sonar findings

The user requested fixes after the read-only Sonar review of PR 14 at
`f97805ce3987bda914c537c4fd91b2388be5339f`. The review reported 51 issues:
one sorting bug, four complexity findings, five ambiguous statement-scope
findings, twelve nested conditionals, eight mutable-prop declarations, one
index key, one redundant guard, one serial-await warning and eighteen SQL
literal findings. Reliability D failed the quality gate.

## Changes

- Explicitly compare balance-history cache identity strings. Preserve canonical
  deduplication, owner/timezone/day isolation and bounded serial RPC batches.
  A named serial batch loader stops immediately on failure; it does not launch
  all history reads in parallel.
- Extract transaction presentation, account-activity enrichment and cleanup
  completion/error handling into named helpers. Preserve owner/request guards,
  polling serialization, slow-response acceptance, exact labels and the
  distinction between server completion and device refresh failure.
- Brace ambiguous guards, including the deletion-conflict branch whose pending
  return must stay unconditional within the conflict handler.
- Replace newly reported nested conditionals with explicit render branches and
  shared pure form-label helpers. Mark component props readonly and key the
  two fixed form-action slots by role.
- Exclude `supabase/tests/**` alongside existing test fixtures. Automatic
  analysis reads default-branch configuration, so project-level exclusions or
  merging that configuration may be required before PR analysis adopts it.
  Keep deployed migration 0040 unchanged and its four repeated-literal
  maintainability findings visible. No broad migration suppression.

## Verification

- 108 focused Jest tests across 16 suites passed, including canonical cache
  identity reuse, serial batching and stopping after the first failed batch.
- TypeScript and full Expo lint passed.
- Local SonarJS checks reproduce no remaining reported complexity/guard/nested
  conditional/readonly findings in the changed code and introduce no new
  findings compared with the original PR commit. The hosted analyzer remains
  authoritative for the final quality gate.
- Production Android/iOS Hermes and static web exports passed. A 98-file audit
  verified public configuration, absence of private configured values and the
  unchanged runtime 1.0.3 / Android version code 7.
- Synthetic phone-web checks at 360px dark and 390px light passed: password
  visibility, checkbox consent, delayed cleanup status, navigation shielding,
  hidden + during cleanup, paired actions and 300px stacking, Cash 100 minus
  expense 50 showing Before 100 / After 50, detail navigation and stale-history
  masking/retry. Light checks also cover reduced motion. Screenshots inspected;
  no real financial writes. Physical-device behavior remains unverified.

The earlier full 762-test run belongs to the original PR commit; this update
uses the focused checks above. No database deployment, OTA, APK or merge is part
of this refactor. Update PR 14 on its existing stacked branch and inspect the
hosted analysis for the pushed commit before reporting its gate result.
