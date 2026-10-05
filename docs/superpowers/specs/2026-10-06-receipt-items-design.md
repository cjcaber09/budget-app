# Receipt Items — Design

**Status:** approved in brainstorming on 2026-10-06. Next step: an implementation plan (superpowers:writing-plans).
**Builds on:** receipt OCR (`docs/superpowers/plans/2026-10-05-receipt-ocr.md`, PR #1).

## Goal

Itemize scanned receipts. A scan extracts each **item with its value**, plus **deductions (discounts), taxes and fees**, and pre-fills the Add Transaction form. The transaction's **amount is computed from those rows**. Users can add or edit rows by hand (including discounts and adjustments) on both new and existing expense transactions. The rows are saved with the transaction.

## Decisions (user-confirmed)

| Topic | Decision |
|---|---|
| Approach | Use **Gemini structured output** (a JSON schema in the existing single `generateContent` call), followed by a small pure **reconciler** that validates and normalizes the result. Rejected alternatives: a hand-written text parser (receipt layouts vary too much, and Vision's text has lost the column layout) and a dedicated receipt API (another vendor, and paid billing required). |
| Scope | **Save rows with the transaction** in a new table, viewable and editable later. Per-item reports and splitting one receipt across categories are out of scope. |
| Manual entry | The **same item editor** is used on Add and Edit Transaction (expenses only), whether or not a scan happened. |
| Amount rule | With at least one row, **amount is computed from the rows and read-only**. With zero rows the amount is editable exactly as today. |
| Mismatch | When the rows don't add up to the receipt's printed total, show a warning with a **one-tap "Add ₱X adjustment"**. |
| Providers | **Gemini first**, returning structured JSON plus the full text. **Vision is the fallback**: text only, no rows, so the user adds rows by hand. |
| Note prefill | The **merchant name** from Gemini. On Vision fallback, the full text as today. The full text always stays in the scan's `.txt`. |

## 1. Reading the receipt (server)

**Gemini call.** Same endpoint, model, timeout and single call per scan. The request adds `generationConfig.responseMimeType: "application/json"` and a `responseSchema` describing:

```ts
interface ExtractedReceipt {
  merchant: string | null;             // → transaction note
  text: string;                        // full transcription → {user_id}/{scan_id}.txt (as today)
  items: { name: string; quantity?: number; unitPrice?: number; amount: number }[];
  deductions: { label: string; amount: number }[];                  // discounts, SC/PWD, vouchers — positive numbers
  taxes: { label: string; amount: number; included: boolean }[];    // included = already inside item prices (typical PH VAT)
  fees: { label: string; amount: number }[];                        // service charge, delivery, etc.
  total: number | null;                // the printed total due
}
```

The prompt tells Gemini to:
- copy amounts exactly as printed;
- give deductions as positive numbers;
- set `included: true` for VAT-inclusive receipts;
- never invent rows.

**Provider order.** `readWithFallback` tries **Gemini** first, then **Vision**. Vision returns `text` only, and `receipt` is `null`. The existing timeouts (Gemini 17 s, Vision 10 s) and the reason-code logging stay. If Gemini's response is unparseable or breaks the schema, it counts as a provider failure.

**Reconciler.** This is pure and import-free. It lives in `supabase/functions/ocr/shared.ts`, which already loads in both Deno and the app. It is the **single implementation of the money math in TypeScript**: the server and the form both use it.
- **Normalize:** round to 2 decimals. Drop non-finite or negative amounts (adjustments may be negative). Cap rows at 100 and labels at 200 characters.
- **Compute:** `items − deductions + fees + taxes where !included (+ adjustments, signed)`.
- **Mismatch flag:** set it when `|computed − total| > 0.01`, and only when `total` is present.

**Storage.** Each scan keeps `{user_id}/{scan_id}.txt` and adds `{user_id}/{scan_id}.json` holding the reconciled receipt.
- Replays and same-image dedupe re-serve both files. A scan without a `.json` (older scans, or a failed `.json` upload) replays with `receipt: null`.
- Deleting a scan removes both files.
- The account-deletion purge already empties the whole `{user_id}/` folder.

**Response.** `OcrScanResult` gains `receipt: ReconciledReceipt | null`. `ReconciledReceipt` is the normalized `ExtractedReceipt` without `text` (the text is already the response's `text` field), plus `computedTotal: number` and `matchesTotal: boolean | null`, which is `null` when there's no printed total. Both types live in `shared.ts`.

**Unchanged.** Quota, limits, auth, idempotency and the privacy note. Gemini's free-tier data use is already disclosed.

## 2. Data model and saving

**Migration `0012`** adds the `budget_tracker.transaction_items` table:

| column | notes |
|---|---|
| `id` uuid pk | |
| `transaction_id`, `user_id` | composite FK `(user_id, transaction_id)` → `transactions(user_id, id)` with `on delete cascade`, the same tenant-scoping pattern as 0003. `transactions` has no `unique (user_id, id)` yet (checked 0003/0004), so 0012 **adds** `transactions_user_id_id_key unique (user_id, id)` first, as 0003 did for `categories`. |
| `kind` | `item`, `deduction`, `tax`, `fee` or `adjustment` |
| `label` | text, 1–200 characters |
| `amount` | numeric(12,2); `>= 0` except `kind = 'adjustment'`, which may be negative |
| `quantity`, `unit_price` | nullable, items only, display only |
| `tax_included` | boolean, default false, meaningful for `tax` only |
| `position` | int, row order |

RLS is owner-only for select, insert, update and delete, like the other tables. Grants follow 0001's defaults.

**Atomic save.** `budget_tracker.save_transaction(p_transaction jsonb, p_items jsonb)` is `security invoker`, so RLS applies.
- In one database transaction, it inserts or updates the transaction and replaces its rows.
- When rows exist, it **recomputes `amount` from them** with the same formula as the reconciler, so the stored amount can't drift from its rows.
- It rejects a non-positive total, which matches the existing `amount > 0` check.
- It returns the saved transaction.

The formula lives in exactly two places, the SQL function and the TS reconciler, and both are tested against the same cases.

**Boundaries**
- A transaction with no rows behaves as today.
- Income stays single-amount, with no item editor.
- Recurring rules, budgets and reports are unchanged; they read `transactions.amount`.

**Hooks**
- `useTransactions` add/update switch to the `save_transaction` RPC and keep their optimistic updates and rollback.
- A new `useTransactionItems(transactionId)` query loads rows for the edit screen.

## 3. The form (UI)

**`TransactionForm`** (expenses only) gains an **Items** section.
- **Row fields:** each row has a label, an amount, a kind chip (Item · Discount · Tax · Fee · Adjustment) and a delete button. Tax rows also get an "included in prices" toggle, and adjustment rows get a +/− toggle.
- **Adding rows:** two buttons, **"+ Item"** and **"+ Discount / adjustment"**. The second adds a Discount row whose kind can be changed.
- **Amount field:** editable when there are no rows. With rows, it shows a read-only live total from the shared reconciler. Deleting the last row makes it editable again.
- **Mismatch warning:** after a scan, shows e.g. *"Rows add up to ₱2,856.90 · receipt says ₱2,866.90"* with an **"Add ₱10.00 adjustment"** button that appends the signed difference as one adjustment row. The printed total is form state only and isn't saved.
- **Saving:** Save is disabled while any row amount is invalid or the total is ≤ 0. The reason shows inline in the existing error style.
- **No outer padding:** the forms intentionally have none (see CLAUDE.md), and the item editor follows suit.

**Add Transaction (scan).**
- **Prefill:** the rows from `receipt` and the note from `merchant`.
- **Vision fallback:** there are no rows, and the full text goes in the note, as today.
- **Unchanged:** Skip, the `visit` keying, and the stored-image handoff stay as they are.

**Edit Transaction (`app/(tabs)/transaction/[id].tsx`).**
- **Rows:** loaded via `useTransactionItems`, and saving replaces them via `save_transaction`.
- **Per-visit keying fix:** this screen also gets the fix that `transaction/new` has. Tab screens stay mounted, so today opening a second transaction can show the first one's values (a pre-existing bug). It's in scope because the screen changes anyway.

**Unchanged.** Transactions list, budgets, reports, Settings → Scanned Receipts.

## 4. Errors

- **Bad Gemini output:** malformed or schema-breaking JSON from Gemini triggers the Vision fallback (text only).
- **Junk rows:** the reconciler drops them silently. Logs carry counts only, never labels, amounts or receipt text, keeping the existing logging rule.
- **No printed total:** the mismatch check is skipped.
- **`.json` upload fails after the `.txt` succeeded:** the scan still succeeds and returns its rows in the response. Later replays return `receipt: null`. The `.txt` stays the primary artifact, and reconciliation keys on it.
- **`save_transaction` fails:** the global mutation toast shows and the optimistic rollback runs. The save is atomic, so nothing is left half-written.
- **Older data:** older transactions and scans have no rows and behave as today.

## 5. Testing

- **Jest, pure functions:**
  - The reconciler: sums, included vs. added taxes, ± adjustments, rounding, caps, dropped rows, ₱0.01 tolerance, and a missing total.
  - The Gemini structured-response parser: valid, malformed, and missing fields.
  - Provider order: Gemini first, Vision fallback, and `receipt` null on Vision.
- **Jest, components:**
  - Form: computed read-only total, mismatch warning plus one-tap adjustment, deleting the last row making the amount editable, and a save payload that includes the rows.
  - Add Transaction: rows and merchant note are prefilled.
  - Edit Transaction: loads rows and resets per visit.
  - `useTransactionItems`.
- **Live (`scripts/ocr-live-test.sh`, extended):**
  - The sample receipt returns rows and `receipt.total = 2866.90`.
  - `save_transaction` stores the amount computed from rows.
  - Another user's `transaction_id` is rejected.
  - Updating replaces the rows.
- **Docs:** CLAUDE.md and README cover the new table, the RPC, the provider order (Gemini → Vision) and the reconciler's single-source rule.

## Out of scope

- Per-item reports and per-item categories.
- Splitting one receipt across categories.
- Merchant or date auto-categorization.
- Editing rows on income transactions.
- Currency handling beyond today's display.
- Showing item counts in the transactions list.
