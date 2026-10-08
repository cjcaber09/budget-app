# Budget Tracker

A mobile personal finance app that brings budgeting, receipt scanning, spending guidance, and payment tracking into one daily workflow.

**Platform:** iOS and Android, built with Expo and React Native. A phone-layout web build supports development and preview.

**Project scope:** Product planning, mobile interface design, frontend development, Supabase database and authentication, OCR integration, and automated verification.

## Portfolio summary

Budget Tracker helps users answer a practical question: how much can I spend while keeping my monthly budget and upcoming bills in view? Users can record income and expenses manually or scan a receipt, review its details, assign a payment method, and see the effect on their budget and tracked balance. The mobile interface pairs clear financial summaries with focused editing screens, light and dark themes, and restrained motion.

## The problem

A transaction list alone does not explain whether spending is sustainable. Users also need to understand category limits, upcoming commitments, and the pace of their spending. Recording detailed purchases or payment screenshots adds another source of friction, especially when income, fees, deductions, and transfers need different treatment.

The project combines those tasks while keeping the financial calculations consistent. Budget spending, tracked account balances, and internal transfers each have distinct accounting rules.

## The experience

The app has four primary screens: Overview, Transactions, Reports, and Settings. A shared add-transaction action offers manual entry, a receipt photo, or an uploaded image.

| Area | What users can do |
| --- | --- |
| Overview | See monthly income and expenses, a global monthly budget, category allocations, safe-to-spend guidance, and daily spending pace. |
| Transactions | Search and filter entries, review scanned details, and edit individual receipt rows in a focused sheet. |
| Reports | Compare spending with budgets through financial charts. |
| Settings | Manage profile details, appearance, currency unit, financial timezone, categories, payment methods, recurring bills, and notification preferences. |

### Receipt scanning and review

Receipt recognition supports purchases and payment documents, including salary and transfer screenshots. It extracts available item rows, amounts, charges, sender details, references, and a receipt date. When no reliable receipt date is available, the app uses the date captured when scanning started.

Users review the result before saving. Ambiguous income/expense direction requires a choice, and pending or failed payment proofs cannot silently become completed transactions. Item rows calculate the transaction amount while informational detail remains visible without being counted twice.

### Budget guidance and recurring bills

Monthly limits are independent of category allocations. Safe-to-spend guidance reserves outstanding bill commitments, and spending-pace calculations provide context for the remaining month. Recurring bills support scheduling, pause/resume, skipping, replacement, and linking an existing expense.

Native phone notifications cover category and monthly budget thresholds at 80% and 100%, alongside optional bill reminders. Notification history prevents repeated alerts after refunds or restarts, and lock-screen details default to private.

### Payment methods and tracked balances

Users can create independent cards, bank accounts, e-wallets, and other payment methods from Settings or transaction review. Each user-created method requires an initial balance; Cash is the default and remains unset until initialized.

Transactions update a derived current balance while preserving the initial amount. Credit cards show an amount owed or an overpayment credit balance. Internal transfers, card repayments, and auditable balance corrections change tracked balances without adding budget income or expenses.

Card identification uses an optional last four digits. The form explains that full card numbers, PINs, and CVVs must not be entered. These balances are manually tracked; the app does not connect to banks.

## Design decisions

The mobile design uses warm neutral surfaces, deep green actions, readable typography, and aligned financial rows. Dashboard containers establish clear groups, while focused forms and slide-up editors keep detailed tasks manageable on a phone.

Impeccable informed the interface work, with motion guided by Emil Kowalski's principles. Screen changes use short transitions, controls provide press feedback, and Reduce Motion disables navigation fades. Navigation retains the tab bar during editing and returns users to the screen they came from.

Preference loading runs in the background. Owner-scoped defaults keep signed-in screens accessible while saved appearance, currency, and timezone settings synchronize. Errors offer retry without discarding form drafts or saved payment selections.

## Technical implementation

| Layer | Technology and responsibility |
| --- | --- |
| Mobile app | Expo, React Native, TypeScript, and Expo Router. |
| Server state | TanStack Query for fetching, cache updates, invalidation, and optimistic rollback. |
| Client state | Zustand for local UI state and session-scoped preferences. |
| Backend | Supabase Auth, Postgres, Storage, and Edge Functions. |
| Receipt recognition | Gemini structured extraction with Google Cloud Vision text fallback. |
| Notifications | Expo Notifications for native local budget alerts and bill reminders. |
| Verification | Jest, TypeScript, lint, hosted SQL checks, phone-layout browser checks, and production exports. |

### Financial correctness

Money crosses the receipt and transaction API as exact decimal strings. Shared arithmetic handles cent rounding, deductions, included taxes, and reconciliation. Database functions save transactions and receipt rows atomically, with stable request IDs supporting exact retries.

Payment balances are calculated from server-captured baselines and eligible dated activity. Assignment timestamps prevent old Cash history from being deducted again when its balance is first initialized. Concurrent retries must create one record and one balance contribution.

Dashboard totals aggregate complete monthly records on the server. Loading additional scan-history pages does not change financial totals.

### Ownership and privacy

Row-level security and owner-checked database functions isolate financial records between users. Payment methods remain independent even when bank names match. Anonymous clients cannot execute the payment-management functions.

Receipt scanning applies authentication, quotas, request replay, and same-image deduplication. Receipt images are not retained; extracted text and structured results support later review. The scan flow includes a disclosure about provider processing.

## Engineering challenges

| Challenge | Implementation decision |
| --- | --- |
| Retries could duplicate a transaction or balance change. | Stable UUIDs and atomic database operations accept exact retries and reject conflicting payloads. |
| Payment summaries and detailed rows could count the same amount twice. | Explicit counted and informational rows preserve detail while controlling which amounts affect totals. |
| Transfers and card repayments could inflate budget spending. | Separate transfer records update both methods without creating income or expense entries. |
| Receipt dates and recurring bills could fall into the wrong month. | Explicit transaction dates and profile-based financial timezones define month membership and scheduling. |
| Slow preferences could block the whole app. | Background bootstrap provides usable defaults and inline recovery while financial data retains honest loading states. |
| Nested editors could return to the wrong tab or reuse stale drafts. | History-based Back behavior and fresh visit IDs preserve navigation context and reset form visits. |

## Implementation evidence

At the latest recorded verification, **242 tests across 36 suites passed**, alongside TypeScript and lint checks. Production iOS and Android Hermes exports and a 28-route web export passed. Supabase migrations through 0019 are deployed.

Hosted database checks exercised ownership, exact retries, balances, transfers, corrections, recurring assignments, and aggregation beyond 1,000 records. A concurrent retry check confirmed one transaction and one balance contribution. Synthetic phone-layout checks covered light and dark themes, creation and selection flows, and draft-preserving error recovery.

Physical-device keyboard, safe-area, native picker, notification delivery, and accessibility verification remain outstanding. These results establish implementation and test coverage; user adoption and measured product outcomes have not been established.

## Short description

> Budget Tracker is a mobile finance app built with Expo, TypeScript, and Supabase. It combines receipt OCR, monthly and category budgets, safe-to-spend guidance, recurring bills, native alerts, and independent payment balances. Its implementation emphasizes reviewable scan results, reliable financial calculations, account isolation, and a clear mobile experience.
