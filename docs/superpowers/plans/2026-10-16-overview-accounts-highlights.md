# Overview accounts and monthly highlights

Approved scope: move Total cash above the calendar, add a vibrant stack of payment-method cards, and add three animated tabs at the bottom of Overview. Preserve the existing budgeting, bill, transfer, refund, and Reports behavior. Implementation stays local; migration deployment and OTA publication are separate release actions.

## Layout and account cards

Order: heading and bills bell → Total cash → Your accounts → calendar → existing budget content and financial summaries → View reports → Monthly highlights. Retain the mobile-only shared workspace, theme, safe areas, FAB and tab navigator.

Total cash and the stack share one payment-method snapshot. Total cash remains the signed sum of active Cash, bank, wallet and debit/prepaid balances. Credit cards, Other and archives remain excluded; any unset contributing balance prevents a misleading partial total. These are current manually tracked balances, independent of the calendar.

The stack contains every active method, Cash first then case-insensitive name/ID. Show the selected card plus at most three distinct cards behind it. Header peeks diminish at 56/32/18px and width decreases with depth. Each card has a stable ID-derived gradient, soft shadow, bold name, type, optional masked last four, exact balance/currency, and Total cash inclusion status. Credit debt uses Amount owed; overpayment uses Credit balance. Uninitialized accounts offer starting-balance recovery through the existing details sheet. The same aggregate-safe presenter formats balances in cards and existing details.

Swipe up for next and down for previous, looping. Use installed Gesture Handler/Reanimated with an Overview-scoped root and native gesture for the parent ScrollView. Activate vertical pan after 12px, reject horizontal movement beyond 20px, commit at 48px or a deliberate 650px/s fling, and allow one change per gesture. Tap movement is limited to 10px and only the front card opens details. Provide 48px cycling controls, position, keyboard and accessibility actions. Single-account decks preserve ordinary page scrolling. Background cards are inaccessible and noninteractive. Keep selected IDs through refresh; after removal choose the next surviving ID; owner changes reset the workspace. Reduced Motion changes cards without sweep/scale.

## Monthly highlights

Centered pill navigation: Recent / Categories / Methods. A single measured indicator springs between tabs; panels cross-fade in 150ms. Measure all panels and reserve their maximum height so switching tabs cannot jump the page. Hidden panels are inaccessible, inert and noninteractive. Support arrow keys, Home/End, visible focus, scalable text and instant Reduced Motion transitions. Keep the active tab when changing month; reset it when changing owner.

- Recent: latest five activities, ordered by financial date, timestamp, kind and ID descending. Include income, expenses, refunds and transfers. Snapshot labels, notes, dates, account details, signed amounts and future-date badges provide context. Composite kind/ID keys avoid collisions; refunds open their parent with refundId; transfers open their own route; every edit visit is fresh. Footer opens Transactions.
- Categories: five largest positive net expense totals after refunds, including Uncategorized and transfer fees. Principal is excluded. Ties use name then ID. Category taps open category details; Uncategorized opens the cash-flow report with that filter. Footer opens Reports.
- Methods: five most-used methods by genuine expense-payment count, including fee expenses. Income, refunds, transfer principal, corrections and opening balances add no uses. Ties use net spending, name and ID. Preserve archived history and distinct duplicate bank IDs; normalize null/explicit Cash assignments. Show type/last four/count and open existing details. Footer opens account spending.

All three lists use the full selected recorded month, including future dates, and explicitly disclose that period. Empty lists show contextual copy, without zero-filled rankings. Loading and section errors offer inline recovery without fabricated figures or stale context.

## Database and data layer

Stage `0036_overview_highlights.sql`: `overview_highlights(p_month date)` is a read-only STABLE SECURITY INVOKER RPC with empty search_path, auth.uid ownership, authenticated-only execution, and the same supported month range as Reports. No table, balance, preference, OCR or write-contract changes.

Version 1 returns owner/month/timezone/financial day and three lists from one database snapshot. Recent reuses the activity-record contract and joins its labels in SQL. Category net spending uses financial_entries (refunds are signed expenses). Method usage uses financial_activity (refund type retained), with a separate signed net-spend tie-breaker. Aggregate complete data before applying LIMIT 5. Aggregate money travels as exact cent strings; individual activity amounts retain existing exact decimal transport.

Strict client decoding validates context and isolates malformed sections. Cache keys include owner, month, timezone and financial day. Central financial invalidation includes overviewHighlights, with resume/day-rollover refresh and no reverse dashboard invalidation loop.

## Verification and release

Use pure/domain tests, hook/component behavior tests, TypeScript and lint. Run synthetic hosted SQL inside BEGIN/ROLLBACK: complete data beyond 1000 records, aggregate limits, owner isolation, null/explicit Cash, duplicate names, fees/refunds, archived history, supported/empty periods, labels, ordering and grants. Verify phone web at 390px light and 360px dark with real touch swipes, page scrolling, details, keyboard controls, measured tab indicator, stable panels, month changes, no overflow and Reduced Motion. Export production web and iOS/Android Hermes using existing dependencies.

Web checks do not establish physical-device gesture feel, performance, screen-reader behavior, font scaling, keyboard or safe-area behavior. Report those limits. Apply 0036 before releasing the new client; it otherwise shows an inline highlights retry. Do not deploy, publish OTA, merge or push as part of implementation alone.

Implemented and verified locally on 2026-10-16. The full Jest run passed 532 tests across 102 suites; after the final focus/accessibility adjustments and added gesture/hook cases, the affected run passed 79 tests across 11 suites. TypeScript, full Expo lint, final affected-file lint and diff checks passed. Synthetic hosted SQL passed inside rollback, including 1005 Cash expense payments, totals above the individual limit, refunds/fees, Uncategorized, deterministic five-of-six ties, archive retention, ownership and grants. Production web plus Android/iOS Hermes exports passed; all 96 export files passed public-setting/private-value exclusion checks. Light 390px and dark 360px browser checks passed in regular and Reduced Motion modes: exact Total cash, real up/down swipes, short-drag cancellation, scrolling outside the deck and through a single card, repeated keyboard focus, real details taps, pill alignment, stable-height panels, future markers, month refresh and no horizontal overflow. Runtime checks caught and fixed missing web selected-state semantics and focus staying on the card that moved behind. Inspected final phone-width captures. Migration 0036 remains staged; no deployment, OTA, APK, commit or push was performed. Physical-device verification remains pending.

## Authorized OTA release — 2026-10-16

The user subsequently requested OTA deployment. The configured-project guard and dry run confirmed only 0036 pending. Applied it through `deploy-overview.mjs --apply` without redeploying OCR; remote/local migration records match through 0036, and the final dry run reports no pending migrations. Deployed rollback-only SQL checks pass, and the REST endpoint is registered and rejects anonymous access. The CLI's Docker catalog-cache warning did not prevent hosted deployment.

Prepared the Android-only OTA from the previously verified production export, checked it was newer than every app/source file, and repeated runtime/public-setting/private-value checks. No native configuration or dependency changes require a new APK. Published the current uncommitted worktree, including transfer autocomplete, to Android preview/runtime 1.0.1 using the existing EAS project and preview environment. Group: `9bdc2e0c-e428-4a3e-811c-4e52773928da`; Android update: `01a14107-9028-7903-9493-d4357a39017d`; created `2026-10-15T19:26:17.128Z`. EAS records HEAD `a64084a` with local changes; this release did not commit, push, merge or update PR #9.

The live preview endpoint serves that exact update and its launch-asset SHA-256 matches the audited local Hermes bytes. Direct asset download returned HTTP 403/text-html, so download-byte comparison and physical-device download/restart remain unverified. Existing assets were reused and one Android bundle uploaded. No APK or iOS OTA was published.
