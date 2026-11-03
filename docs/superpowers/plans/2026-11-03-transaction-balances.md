# Before and after account balances

Show server-calculated running balances beside saved activity and in its detail view. Start from each account's saved opening balance and use its complete eligible income, expenses, transfers, transfer fees, refunds and corrections. Month/search/type filters must never define the balance calculation. Preserve Cash baseline rules, future financial dates, independent account IDs and signed credit-card accounting.

Existing records have no immutable balance snapshots. These are reconstructed running balances ordered by when an entry begins to affect the account (the later of assignment time and its financial day's start), then kind/ID for ties. Edits, deletion, reassignment and changes to the opening balance recalculate history. State this in the detail view. A transfer's source change includes its fee once. Linked fee details refer to the whole transfer's balance change.

Uninitialized accounts, entries already included in the opening balance and future entries show explicit explanations instead of fabricated numbers. Reconcile each complete ledger against the authoritative method_balance result in the same database snapshot; never display an unreconciled result. Use exact signed cent strings and validate ownership, timezone, financial day, request identities and before/change/after arithmetic.

Add a bounded owner-only read RPC and a batched cache keyed by owner/timezone/day/activity identities. Refresh after financial changes, app resume and financial-day rollover. Keep errors local and retryable. Do not write financial data as part of reading history.

Investigate the reported Cash expense of 50 separately. A rollback-only synthetic hosted check of starting Cash 100, expense 50 and snapshot refresh returns 50. Do not claim a user-specific correction without reproducing its cause or rewrite existing baselines/history.

Verification: rollback-only SQL tests of reconciliation, exact 50 deduction, edits/retries/reassignment, same-day baselines, future/backdated entries, correction ordering, refunds/transfer fees, multiple owners, large complete ledgers and permissions. Targeted Jest decoder/hook/UI regressions, TypeScript/lint, light/dark phone-web rendering and production exports. Physical-device delivery remains separate.

Completed: migration0040 deployed to the configured Supabase project after rollback tests and a dry run showing no other pending migration. Deployed rollback checks also passed under the authenticated role. The CLI warned that its migration-catalog cache could not read a certificate after the successful push; remote0040 and the deployed RPC were independently verified. No financial records or existing write/calculation rules were changed.

108 tests/14 targeted suites, TypeScript, full Expo lint, whitespace, layout scan and Android/iOS/web production exports pass. Export98-file audit confirms only public settings and runtime1.0.3/code7. Synthetic360dark/390light previews verify Cash100/expense50/after50 in list and details, no overflow, failed-refresh masking and successful Retry. Source screenshots are in docs/screenshots/activity-balances-list-dark.png and activity-balances-detail-light.png. No physical-phone check, OTA/APK publication, commit or PR update in this task.

The user explicitly asked to set aside the unexplained original discrepancy and proceed with tracking. No user-specific balance repair is claimed. Initial test failures were isolated to a SQL alias, invalid synthetic fixtures and missing mocks for the new query dependency; all were corrected before the final checks.
