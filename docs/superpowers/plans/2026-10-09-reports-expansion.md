# Next implementation: Expanded Reports

Status: implemented on 2026-10-09; final verification recorded below. The [dashboard report relocation](2026-10-09-dashboard-reports-move.md) and category doughnut correction are preserved.

## Summary

All new analytics belong in Reports. Overview retains the simplified layout agreed in the relocation plan.

## Reports to implement

| Report | Contents |
| --- | --- |
| Detailed cash flow | Recorded income, expenses, net amount, and dated transaction history. Show internal transfers separately without affecting income/expense totals. |
| Income breakdown/history | Totals and percentages by user-managed income source, with filtered income history and links to transaction details. |
| Expense trends | Daily, weekly, and monthly views. Daily/weekly views cover the selected month; monthly history covers 12 months ending with it. |
| Full category performance | Budget, recorded spending, remaining/overage, budget usage, spending share, transaction count, and historical trend. |
| All categories + percentages | Include zero-spend categories. Include an Uncategorized bucket when needed so percentages reconcile with total expenses. |
| Account spending breakdown | Expenses grouped by individual payment method, including Cash and archived methods with activity. Keep separate banks/cards distinct. |
| Previous-month comparison | Income, expenses, net amount, and category spending changes, with absolute and percentage differences. |

Report summaries open focused detail views rather than placing every history list on one long screen. Detail views retain the selected month and support Back to Reports.

Preserve the existing Budget vs Actual three-column category doughnut grid. Extend its read-only category detail with spending share, transaction count and historical performance; retain the explicit Edit budget action and category transactions. Replace the existing six-month trend with the twelve-month trend ending in the selected month; do not add a duplicate chart. Keep line/area visuals for trends, the existing Spending by Category list legend, and section-local loading/error/retry.

## Data and interfaces

- Add owner-scoped **income sources** with create, rename, archive, and restore controls in Settings. Allow creating/selecting a source during income transaction review.
- Add an optional income-source assignment to transactions. Existing income remains **Unspecified** until assigned; receipt sender names do not automatically select a source.
- Extend transaction saves to validate source ownership, preserve omitted assignments from older clients, and include assignments in exact-retry comparisons. Expense transactions cannot retain an income source.
- Add an owner-authenticated reporting snapshot RPC for complete server-side aggregates. Return period, timezone, totals, category/source/payment-method breakdowns, and trend buckets.
- Reuse existing transaction detail/history behavior. Refresh report caches after relevant transaction, budget, source, transfer, preference, and category changes.
- Keep money calculations exact and financial dates consistent with the profile timezone. Initial balances and balance corrections do not count as report income or expenses.

### Income-source integrity and compatibility

- Enforce ownership through income-source RLS and a tenant-scoped foreign key from transactions. Add a database constraint requiring expense transactions to have no income source; validate direct writes as well as RPC saves. Explicitly revoke public/anonymous access to new tables/functions and grant only the required authenticated permissions.
- Extend the transaction payload with a new version while keeping older clients compatible. For income updates, an omitted source preserves its existing assignment; explicit null clears it. Income-to-expense conversion clears the assignment, including the bill-command path. Existing income and recurring income without a source remain Unspecified.
- Archived sources remain attached to history. Allow unchanged archived assignments during unrelated edits and exact create retries, but reject new assignments or reassignment to them. Serialize archive/assignment changes with the existing owner financial lock and source-row locks so a concurrent save cannot bypass archiving.
- Apply these rules to ordinary saves, item-based/OCR review, and bill record/edit/conversion paths. Include source assignment in canonical exact-retry comparison without weakening existing receipt, payment-method, date or bill integrity rules. Preserve all existing source assignments when migrating.

### Income-source form recovery

- Initialize an edit form's source ID from its loaded transaction snapshot before enabling source changes. Loading names, a failed source query or a background refresh must not replace that ID with null or overwrite a draft. Preserve an untouched assignment; only an explicit clear action clears it.
- Show the currently assigned archived source with an Archived label, while excluding archived sources from new selections. Allow replacing or explicitly clearing that assignment without blocking unrelated edits that preserve it.
- Save a newly created source before assigning it to a transaction. If the transaction save then fails, retain the created source ID and the transaction draft for retry rather than creating another source. A failed source creation retains its name draft and exposes retry. Source loading must not gate navigation or unrelated transaction fields.
- Generate the source-create UUID on the client and retain it with the pending creation payload across retries. The owner-checked creation RPC must return the existing source for an identical create retry and reject a conflicting payload for that UUID. A timeout after commit must not create a duplicate. Keep an unconfirmed creation's identity/payload until retry resolves it; use an explicit rename/update after creation is confirmed rather than changing a create retry's payload. Exact retries must also work if the created source has since been archived, without restoring it or allowing a new assignment to it.

### Snapshot freshness and report history

- Prepare existing recurring bills before reading report aggregates. Read totals, breakdowns and trend buckets from one consistent database snapshot; use the same effective financial date rules as existing reports. A preparation or aggregate failure is retryable and must not produce confirmed zero totals.
- Key report caches by owner, selected month, financial timezone and financial day. Refresh on app resume/date rollover and after transaction/item edits or deletion, budget/allowance changes, source/category/payment-method changes, transfers, bill commands and successful recurring catch-up. Refresh relevant histories as well as summaries; avoid report/dashboard self-invalidation loops.
- Report detail routes stay under the existing tab navigator with hidden tab entries and custom Back buttons. Pass the selected month and category/source/account filter explicitly, use a fresh visit, and reset filter state on each visit. Unspecified filters null income-source assignments; Uncategorized filters null expense-category assignments; Cash includes null payment-method assignments and any explicit Cash assignments.
- Reuse shared transaction rows/edit navigation and complete automatic fetching for filtered histories, including more than 1,000 records. Do not add pagination controls. Transaction edits return to the same report history/filter/month; Back to Reports restores that report month. Account changes clear report data and filter state.
- Transfers use a separate owner-scoped, read-only history contract with ID, transfer date, exact amount, source/destination method IDs and display names, and note. Filter by transfer_date, retain archived method labels, and order by (transfer_date, ID). Fetch complete history automatically; one transfer appears once, not once per account leg, and does not use ordinary transaction IDs or edit routes.
- Validate the selected reporting month against the existing preparation limit: no later than the current financial month plus two years. At the final supported month, disable Reports' Next month action. A deep link or shared selected-month value outside the supported range shows a clear unsupported-period state without invoking preparation or displaying zero totals. Retain the selected month rather than silently clamping it; offer a Return to current month action. Validate that the twelve-month start is also within supported calendar dates.

## Calculation rules

- Monthly reports preserve the app's recorded-month totals. Clearly identify future-dated entries; they are not verified bank movements.
- Internal transfers appear separately and count once per transfer.
- Weeks start Monday and are clipped to the selected month. Include zero-activity days and weeks.
- Current-month comparison uses month-to-date versus the same elapsed days last month, clamped to that month's length. Historical months compare full months; future months have no comparison.
- When the previous value is zero, show the amount difference and an unavailable percentage rather than infinity.
- Spending percentages use total recorded expenses as their denominator. Budget usage is unavailable for an unbudgeted category.
- Archived sources and payment methods remain visible in historical reports but cannot receive new assignments.

### Reconciliation and comparisons

- Keep full recorded-month totals separate from comparison-period totals in the snapshot. Return both comparison date ranges explicitly. Current-month comparison excludes future-dated entries; full monthly reports retain them with clear labels. Display the actual ranges when the previous month is shorter rather than implying equal day counts.
- Calculate income/expense percentage change only when the previous amount is positive. For net income, show the absolute change but no percentage when the previous net amount is zero or negative. Future-month comparisons remain unavailable.
- Group null payment-method assignments into Cash, including legacy transactions, instead of dropping them through an inner join. Group every other method by its stable ID; duplicate names never merge accounts. Opening balances, corrections and internal transfers stay outside account expense totals.
- Calculate account spending directly from expense transactions grouped by payment-method identity and effective financial date. Do not reuse tracked-balance calculations or filter expenses by baseline_at or payment_assigned_at. Expenses before Cash initialization remain reportable, and changing an opening balance does not alter report spending.
- Use left joins and explicit Unspecified/Uncategorized buckets so income-source totals equal income, and category/account totals equal expenses. Successful zero-expense months show zero amounts with unavailable spending-share percentages; zero-income months similarly have unavailable source-share percentages. Unbudgeted categories have unavailable budget usage.

### Exact aggregate money transport

- Return all report monetary fields, including breakdowns, comparison deltas, trend buckets and transfer amounts, as signed integer-cent strings. Sum and subtract using exact database numeric arithmetic before serialization; represent missing monetary values as null rather than zero.
- Use a dedicated report-money decoder that validates integer syntax and the JavaScript safe-integer range before conversion. Do not apply the existing per-transaction MAX_MONEY_CENTS limit to aggregate totals. Values outside the supported safe range produce a clear section-local error; never silently round, clamp or substitute zero. Validate derived client-side differences too, or consume the server-provided exact deltas.
- Validate shared snapshot context (owner, timezone, requested period and financial day) centrally. A transport/RPC failure or invalid shared context blocks the sections dependent on that snapshot and offers retry. After context validation, decode each report section independently into a success/error result; do not throw one section's money/shape error into the entire report query or rendering tree. A malformed or unsupported comparison delta must not hide otherwise valid budgets, trends or breakdowns. Mark only sections that depend on the invalid value as unavailable; never derive apparently valid percentages or reconciliation totals from rejected data. Unrelated sections backed by separate queries remain usable.
- Continue using the shared currency formatter after checked conversion, preserving the account's currency unit without conversion. Percentage ratios derive from validated values and retain the zero/negative-baseline rules above.

## Verification and rollout

- Test source ownership, archive behavior, legacy preservation, exact retries, and income/expense conversion.
- Verify totals reconcile across summaries, breakdowns, and transaction history, including more than 1,000 records.
- Cover transfers, corrections, zero activity, uncategorized expenses, future dates, month boundaries, leap years, timezone changes, and shorter previous months.
- Verify mobile charts, drilldowns, Back navigation, light/dark themes, reduced motion, loading states, and retry behavior.
- Apply a new migration after hosted SQL checks; run Jest, TypeScript, lint, production exports, and runtime checks before release.

### Required review regressions

- Reject foreign-source assignments, anonymous RPC access and invalid direct writes. Verify archive-while-editing, preserved archived assignments, explicit clearing, exact retries, legacy clients and bill income/expense conversion.
- Verify Cash/null assignments, Unspecified income, Uncategorized expenses, archived methods and duplicate account names reconcile with complete totals and filtered histories beyond 1,000 records.
- Verify separate full-month/MTD figures, future-dated entries, negative/zero previous net income, shorter prior months, timezone/day rollover and refresh after bill catch-up/settlement, transfers and category/source renaming.
- Verify historical selections anchor the twelve-month trend correctly, preserve the category doughnut grid and Edit budget workflow, and retain filters/month through report detail, transaction edit and Back navigation without blocking unrelated report sections on failure.
- Verify income-source IDs survive delayed/failed loading and background refetches, archived assignments remain visible, explicit clearing works, and a failed transaction save retains its newly created source and draft without duplicate creation.
- Simulate source creation committing before its response times out. Verify an identical retry returns the same source with no duplicate, a conflicting create payload is rejected, owner isolation is preserved, and an archived source is neither restored nor newly assigned by retry recovery.
- Verify transfer history uses transfer_date and the correct source/destination labels, includes archived methods, handles more than 1,000 transfers, and counts every transfer once outside income/expense totals.
- Verify pre-baseline Cash expenses remain in account reports and opening-balance edits leave spending totals unchanged. Cover aggregate amounts above the individual transaction limit, malformed cent strings and the positive/negative safe-integer boundaries, including comparison deltas.
- Inject an invalid or unsupported comparison delta into an otherwise valid snapshot and verify independent sections still display their confirmed data. Verify dependent calculations become unavailable, invalid shared owner/period context is rejected, and snapshot request failures expose retry without fabricated figures or a rendering exception.
- Verify the final supported future month and the following month, timezone rollover of that boundary, invalid deep-link/shared-state selections, Return to current month, and calendar validity of the twelve-month range.

## Confirmed review decisions

- Group income by optional user-managed sources such as Salary, Freelance, or Refund; existing entries start as Unspecified.
- Include internal transfers as a separate cash-flow section, excluded from income/expense totals.
- Use matching elapsed periods for current-month comparisons and full periods for historical months.

## Implementation

- Migrations 0021 and 0022 are deployed to the configured hosted Supabase project; remote migrations 0001–0022 match local files. Income sources have owner RLS, a tenant foreign key, archived-assignment guards and client UUID exact retries. Transaction payload version 4 preserves omitted legacy assignments and clears sources on expense conversion; ordinary and bill saves share these rules.
- Reports uses a single prepared reporting snapshot with exact cent strings and independently decoded sections. Transaction and transfer history RPCs return complete owner/month/timezone JSON envelopes in one database read, avoiding the 1,000-row response cap and shifting offset pages. No pagination controls were added.
- Summary links open focused cash flow, income, account, comparison and trend views under the existing tabs. Detail/filter/month visits reset correctly and shared transaction edit navigation returns to its originating report. Income sources can be created in Settings or income review, renamed, archived and restored; failed creation retains its UUID/name for retry and failed transaction saves retain the created assignment.
- Budget vs Actual preserves its three-column category doughnuts. Category detail adds remaining/overage, spending share, guarded budget usage, count and twelve-month history. Spending shares include zero categories and Uncategorized with exact amounts. Line/area trends offer daily, Monday-based clipped weekly and twelve selected-month anchored monthly views.
- Current comparisons use matching elapsed dates; historical comparisons cover full months. Future comparisons and nonpositive-prior percentages are unavailable. Cash includes null and explicit Cash assignments; opening balances, corrections and transfers do not affect income/expense totals.

## Verification

- Hosted rollback tests cover ownership/direct-write denial, archive/legacy/exact retries, bill conversion, more than 1,000 transactions and transfers, account/category reconciliation, explicit and pre-baseline Cash, duplicate banks, Uncategorized, leap years, MTD/future separation, supported periods and aggregate cent transport. Concurrent source and transaction retries produce one record; archiving serializes against new assignment. Synthetic data is rolled back or deleted and cleanup verified.
- All 310 Jest tests across 51 suites pass, covering report decoding/precision/section failures, owner isolation/day rollover, complete histories, source retry recovery/archived selection/conversion, month/filter visits, separate transfers, clipped weekly labels and category thresholds. TypeScript and lint pass. Final production Android/iOS Hermes and web 30-route exports pass in the temporary budget-reports-expanded-verified output directory.
- Synthetic phone-web checks cover 390px light and 360px dark/reduced-motion layouts, charts, drilldowns, transaction edit/Back, filtered income/Cash histories, source creation committing before a lost response and identical retry, plus comparison error/retry recovery. Native-device keyboard, safe-area, screen-reader and motion checks remain unverified. Final production export and independent visual disposition are recorded in the repository build log.
- Supplemental phone-web interactions pass Settings source rename/archive/restore, historical selected-month anchoring, unsupported-period request suppression and Return to current month. Browser checks wait for hydration before interacting with a freshly loaded recovery screen.
- The independent visual review found the weekly caption incorrectly ended at the last bucket's start. It now uses the bucket's end and includes both dates in accessible labels; a clipped Oct 26–31 regression test and both weekly recaptures pass. Final reviewer disposition: ship for the verified phone-web scope. Impeccable documenter preserved the incumbent DESIGN.md/design.json because no durable identity/token change was introduced.
