# Withdrawals and transfers in Add Transaction

Approved behavior: Transfer beside Expense/Income; completed withdrawal OCR selects Transfer, defaults To Cash and requires explicit From selection. Manual Add Transaction leaves both accounts empty. Shared entry/edit/Settings form, neutral principal, one linked fee expense, optional private proof, combined history/filter/export and device draft recovery.

Money: stored principal is received money. Received 2000 + fee15 debits2015. Debit2000 including fee15 receives1985. Canonical integer cents reconcile before OCR prefill; ambiguous fees/status/amounts require review or clearing for manual entry.

0035 adds immutable/inferred creation ordering, revisions, private command receipts surviving transfer deletion, durable cross-kind activity-ID claims, and exactly-one-parent transfer attachments. Existing owner/id uniqueness and accounting writer are reused. New save_transfer_entry v3 requires expected revisions for edits/deletes; exact command UUID retries cannot duplicate or resurrect. Legacy create/read stays available; legacy edits/deletes require app update. Legacy snapshots never claim known original create payloads.

History-only activity RPCs combine transactions/refunds/transfers, with 10-row composite cursors and complete export snapshots. Aggregate accounting views exclude transfer principal. CSV includes row_kind, principal, fee, source/destination and explicit income/spending effects. Fee expenses count once; refunds reduce spending. Composite kind/id identity preserves legacy collisions.

OCR schema3 adds withdrawal/internal recognition. Legacy projections clear counted withdrawal money; cached old scans remain manual when classification is unavailable. A validated v3 request may retry once as v2 on the old server's version rejection, preserving scan ID/image/quota/replay. Authentication/provider limits/publication/cleanup remain.

ProofParent discriminates transaction/transfer throughout uploads, reads, validation and caches. Save finance first; retry attachment independently with stable file UUID. Transfer paths use owner/transfers/transferId/fileId.ext. Owner FKs, RLS, upload leases, cleanup outbox and reset/Auth cascades remain authoritative.

Draft v2 transfer variant shares existing owner-scoped serialized device storage; v1 decoding remains. Persist reviewed fields/review flags and exact pending command before sending; freeze type/fields until resolved. Files, raw OCR and full printed identifiers are excluded. Clear on confirmed save/discard/sign-out/reset; preserve drafts on storage/network failures.

Verify money/fees/credit/baselines/future dates; exact retries and stale revisions; cross-kind concurrency; history cursors and >1000 export; OCR compatibility; proof isolation/cleanup and draft migration. Run Jest/TypeScript/lint, rollback SQL and phone-web light390/dark360 runtime checks. Deployment/OTA is a separate release action after verification; physical-device behavior must be reported honestly.

## Implementation and verification

Implemented locally on 2026-10-15. Add Transaction, Settings and transfer history editing share TransferEntryForm. Pending creates from Settings also save the exact command in the owner/device draft slot before sending. A different unfinished draft blocks that save instead of being overwritten. Add Transaction can resume the pending command, retry it unchanged, or confirm its saved status without issuing another write.

Validation passed: the full Jest suite (502 tests, 97 suites), followed by the final recovery/proof/payment-method checks (55 tests, 5 suites); TypeScript; Expo lint; OCR Deno checking; and a production web export with private environment values excluded. Synthetic browser interactions passed at light 390px and dark 360px, covering searchable accounts, fees, reload recovery, lost-response exact retries, history/edit navigation and Settings-to-Add-Transaction recovery without duplicate writes.

`node scripts/transfer-entry-sql-test.mjs --mvp` passed against the configured hosted database inside BEGIN/ROLLBACK, including migration 0035, transfer/fee accounting, credit advances, baseline/future-date behavior, revisions, durable activity IDs, proof ownership/cleanup, more than 1000 export rows, financial reset, Auth deletion and existing MVP regressions. Existing deployed account-deletion and attachment live checks passed 26 cases each with disposable owners/files cleaned up. Those live checks verify the deployed 0034 baseline, not the staged transfer attachment RPC.

Release remains separate: apply 0035, deploy the matching OCR function, run the deployed SQL/proof checks and `node scripts/transfer-entry-concurrency-test.mjs`, then publish the verified app update. No migration, function deployment, OTA, APK, commit or push was performed for this feature. The concurrency runner is prepared but has not run against 0035; Docker's daemon was unavailable for an isolated concurrent database run. Physical-device picker, keyboard, app-kill, safe-area and accessibility checks remain pending.
