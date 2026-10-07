# Receipt Items - Design

**Status:** feature scope approved on 2026-10-06; correctness gaps resolved on 2026-10-07 following review. Implemented and deployed to the app's Supabase project on 2026-10-07. Local changes remain uncommitted. Verification: 143 Jest tests, TypeScript, lint, isolated PostgreSQL integrity/concurrency tests, iOS/Android/web exports, mobile web previews, and 19 live receipt checks pass. See the build progress log for evidence and limits; native device verification remains pending.
**Builds on:** receipt OCR (`docs/superpowers/plans/2026-10-05-receipt-ocr.md`, PR #1).
**UI authority:** `DESIGN.md` and `AGENTS.md`. This is a mobile-only feature; use the existing shared forms, theme, bottom-tab navigation, safe-area handling, and motion conventions.

## Goal

Itemize scanned receipts. Extract purchased items, discounts, taxes, and fees; prefill an expense transaction; compute its amount from the rows; and save those rows for later editing. The same editor supports manual expenses without a scan.

## Approved scope and review clarifications

| Topic | Contract |
|---|---|
| Extraction | One Gemini structured-output call, followed by a pure reconciler; Vision is the text-only fallback. No handwritten receipt parser or new receipt vendor. |
| Persistence | Save rows with their transaction. Per-item reports and per-item categories remain out of scope. |
| Manual entry | Use the same item editor on Add and Edit Transaction, expenses only. |
| Amount | With rows, the amount is computed and read-only. Without rows, the amount is editable. |
| Mismatch | Show the printed total and a one-tap signed adjustment when the difference exceeds one cent. |
| Note | Gemini merchant name; a missing merchant leaves the note blank. Vision fallback uses the transcribed text as today. |
| Currency | Preserve the app's current `$` display and two decimal places. Receipt currency does not trigger conversion. Do not mix peso symbols into this feature. |
| Money | Integer cents are authoritative in TypeScript. SQL uses exact numeric arithmetic with the same rounding rule. |
| Integrity | RPC saves are atomic; database constraints/triggers also reject inconsistent direct writes. Keep `SECURITY INVOKER` and owner RLS. |

## 1. Shared types and money contract

All receipt types and pure money helpers live in import-free `supabase/functions/ocr/shared.ts`, used by Deno and the app. Provider response parsing stays pure in `ocrProviders.ts`.

```ts
type TransactionItemKind = 'item' | 'deduction' | 'tax' | 'fee' | 'adjustment';

interface TransactionItemInput {
  kind: TransactionItemKind;
  label: string;
  amountCents: number;                 // signed only for adjustments
  quantity: string | null;             // canonical decimal; items only, display only
  unitPriceCents: number | null;       // items only, display only
  taxIncluded: boolean;                // true only for included tax
}

interface ExtractedReceipt {
  merchant: string | null;
  text: string;
  items: { name: string; quantity?: number; unitPrice?: number; amount: number }[];
  deductions: { label: string; amount: number }[];
  taxes: { label: string; amount: number; included: boolean }[];
  fees: { label: string; amount: number }[];
  total: number | null;
}

interface ReconciledReceipt {
  schemaVersion: 1;
  merchant: string | null;
  rows: TransactionItemInput[];
  totalCents: number | null;
  computedTotalCents: number;
  matchesTotal: boolean | null;
  droppedRowCount: number;
  cappedRowCount: number;
}

interface OcrScanResult {
  scanId: string;
  text: string;
  path: string;
  truncated: boolean;
  receipt: ReconciledReceipt | null;
}
```

**Conversion and rounding.** Convert a finite provider number's canonical decimal string to cents using decimal digits and exponent handling, with ties rounded away from zero. Do not use `Math.round(value * 100)`, floating-point accumulation, or an epsilon-based money comparison. For example, `1.005` becomes 101 cents and `-1.005` becomes -101 cents. Manual money drafts use a decimal point and at most two fractional digits; reject invalid drafts instead of silently rounding them.

Every cent value must be a safe integer. Each stored money value has an absolute maximum of 999999999999 cents (`numeric(12,2)`); non-adjustment amounts cannot be negative. The final transaction total must be between 1 and 999999999999 cents. Check the final range after summing, not just each row. A bounded 100-row sum remains within JavaScript's safe-integer range.

**Normalization.** An adapter flattens Gemini's groups in the order items, deductions, taxes, fees. Manual adjustments use the same flat type and reconciler. The limit is 100 rows combined, not 100 per group. Trim labels; drop blank labels and truncate OCR labels to 200 Unicode code points. Drop invalid OCR monetary values, including non-finite, negative non-adjustment, and out-of-range values. Normalize invalid optional item metadata to null; clear metadata on non-item kinds and `taxIncluded` on non-tax kinds. Merchant names are trimmed and capped at 200 code points.

Quantity is positive, has at most three decimal places, and fits `numeric(12,3)`; unit price is nonnegative money. Both are descriptive metadata. The printed line amount is authoritative; do not multiply quantity and unit price to replace it.

**Formula.** Sum integer cents as `items - deductions + fees + non-included taxes + signed adjustments`. Included taxes contribute zero. Round individual provider monetary fields during conversion, not the accumulated result. SQL's one money helper follows the same rule and is reused by saves and integrity checks.

**Mismatch.** With at least one row and a valid printed total, `matchesTotal = abs(computedTotalCents - totalCents) <= 1`. Otherwise it is null. A difference of exactly one cent is accepted. Never compare a floating-point dollar difference to `0.01`. Dropped/capped rows produce a review warning even when there is no printed total; log counts only.

Shared decimal and cent-formatting helpers serialize money to exact two-decimal strings and display the current `$` convention. Display formatting is not another implementation of the summation formula.

## 2. Reading the receipt

**Gemini request.** Keep the endpoint, configured model, single call, and 17-second timeout. Add JSON response MIME type and a supported response schema matching `ExtractedReceipt`, including explicit required fields and nullable merchant/total. The prompt requires exact printed values, positive deductions, VAT-inclusive tax flags, and no invented items or reconciliation adjustments. Adjustments are user-created corrections.

Do not assume the existing 8192-token transcription budget covers transcription plus item JSON. The implementation must choose and validate an output budget supported by the configured model against the bounded large-receipt fixture. It must retain one bounded call and the existing timeout; insufficient output falls back to Vision rather than returning partial items. Bound provider response size before parsing, and verify the chosen model's structured-output schema support before deployment.

**Validation boundary.** Malformed/truncated JSON, `MAX_TOKENS`, blocked output, missing required top-level fields, or wrong structural types fail the Gemini attempt. Never treat truncated output as successful itemization, even if it happens to parse. For a structurally valid receipt, the reconciler handles semantically invalid row values by dropping them and reporting counts. Structural failure and semantic normalization are distinct; neither relies solely on the provider's schema guarantee. A printed/computed-total mismatch is a successful extraction needing user review, not a reason to invent rows or silently retry a provider.

**Fallback.** Try Gemini first, then Vision with its existing 10-second timeout. Vision returns text and `receipt: null`. Preserve reason-code-only logging, auth, quotas, request IDs, same-image dedupe, and the existing provider privacy disclosure. The client's 30-second limit must still accommodate both provider timeouts and storage work; test this budget with both files involved.

**Text.** Preserve the existing 20000-character text clamp and `truncated` flag. The response and `.txt` contain the same bounded transcription, not an unbounded promise of the full original receipt. JSON stores the normalized receipt without duplicated transcription. No raw receipt image is retained.

## 3. Storage publication, replay, and deletion

Paths are derived, never accepted from the client: `{user_id}/{scan_id}.txt` and `{user_id}/{scan_id}.json`. The JSON envelope contains `schemaVersion: 1`.

The `.txt` is the completion marker because existing pending-scan reconciliation and replay use its presence. Publish it **last**:

1. Extract and reconcile in memory while the ledger row is pending.
2. Attempt the JSON upload and settle that attempt before proceeding. Vision skips it. A JSON upload failure is tolerated and logged by code only; do not schedule a late/background upload.
3. Upload the bounded `.txt` only after the JSON attempt has completed. Once this succeeds, neither receipt artifact is written again for this scan.
4. Mark the ledger completed. If this status update fails, the existing `.txt`-based reconciliation can recover safely.
5. Return the text and the in-memory receipt. If JSON storage failed, the first response may contain rows while later replay returns `receipt: null`; that degraded persistence is intentional.

If `.txt` fails after JSON succeeded, clean up the JSON before marking the scan failed. Cleanup failure is logged and must be retried by an explicit failed-scan artifact cleanup path; never publish `.txt` or mark completed after a text-upload failure. Account deletion still purges the whole user folder.

**Replay.** Without the completion marker, pending replay returns 409, even if JSON exists. After `.txt` exists, read both artifacts. A genuinely absent JSON file, an old unsupported envelope, or malformed cached receipt data gives `receipt: null` and a code/count-only diagnostic. An actual Storage/network error is retryable failure, not an absent-file result. Validate cached rows and recompute their totals rather than trusting cached derived fields. Missing text follows existing pending/deleted behavior.

**Delete.** Preserve the owner check and completed/deleted ledger semantics. Remove both files before marking deleted. Missing files are successful idempotent removal; an actual removal failure keeps deletion retryable. No scan writer may upload JSON after the text marker is published, so a concurrent replay/delete cannot resurrect an artifact. The account purge continues removing every file in the user's folder.

## 4. Data model and integrity

Migration `0012` adds `transactions_user_id_id_key unique (user_id, id)` and `budget_tracker.transaction_items`:

| Column | Constraint |
|---|---|
| `id` | UUID primary key. Generated by the database when replacing rows. |
| `transaction_id`, `user_id` | Non-null composite FK to `transactions(user_id, id)`, `on delete cascade`. Ownership and parent association are immutable after insertion. |
| `kind` | One of item, deduction, tax, fee, adjustment. |
| `label` | Nonblank after trimming; 1-200 Unicode code points. |
| `amount` | `numeric(12,2)`, finite and in range; nonnegative except signed adjustments. |
| `quantity` | Nullable `numeric(12,3)`, finite and positive; items only. |
| `unit_price` | Nullable `numeric(12,2)`, finite and nonnegative; items only. |
| `tax_included` | Non-null boolean, default false; true only for tax rows. |
| `position` | Nonnegative integer, unique within a transaction; assigned from array order. |

Owner-only SELECT/INSERT/UPDATE/DELETE policies retain the tenant-scoped FK pattern. Explicitly reject SQL numeric `NaN`; positivity alone is insufficient. Apply finite/range checks to `transactions.amount` as well as item money/metadata. Expense and income totals remain positive.

**Database-wide invariant.** RLS establishes ownership; it does not establish arithmetic consistency. Keep owner CRUD and `SECURITY INVOKER`, but add deferred constraint triggers on parent INSERT/UPDATE and item INSERT/UPDATE/DELETE. At transaction completion they enforce:

- An income transaction has zero item rows.
- An expense with rows has an amount equal to the shared SQL helper's exact total.
- The total is positive and in range, and the combined row count is at most 100.
- An expense without rows retains a valid independently entered amount.

Item writes lock their parent before changing its row set. RPC saves lock the parent before replacements. This serializes saves/direct edits; conflicting operations must either commit a valid final state or fail atomically, never leave interleaved rows. Parent deletion and cascaded child deletion skip the final check when the parent no longer exists. Trigger functions use the same SQL arithmetic helper; they do not duplicate the formula or disable RLS. Lock/constraint failures are surfaced as retryable or validation errors without leaking receipt payloads.

Direct API changes that would desynchronize rows and amount are rejected. Deleting the last item is allowed: the still-valid parent amount becomes the editable manual amount. No new `SECURITY DEFINER` write RPC is required.

## 5. Atomic save and queries

`budget_tracker.save_transaction(p_transaction jsonb, p_items jsonb)` is a `SECURITY INVOKER` write RPC with a pinned search path and explicit schema qualification. Grant execution to authenticated users; revoke it from public/anon despite 0001's permissive function defaults.

**Payload.** `p_transaction` has an explicit create/update operation, UUID id, type, category_id, amount as an exact two-decimal string, note, and occurred_at. `p_items` is a required array of canonical flat rows: kind, label, amount as an exact two-decimal string, nullable quantity/unit_price decimal strings, and tax_included. Derive user_id from `auth.uid()` and positions from array order; do not trust supplied owners, child IDs, or positions. The hook maps canonical cent values to decimal strings without floating-point arithmetic.

**Validation.** Reject unauthenticated calls, inaccessible/missing update targets, malformed objects/arrays, invalid kinds or flags, nonblank-label violations, noncanonical/negative/out-of-range monetary values, invalid metadata, and more than 100 combined rows. Income with a nonempty array is invalid. Do not silently drop manual/RPC rows. Structural validation must precede numeric casts, and database constraints also protect direct writes.

**Write.** In one transaction, lock the existing parent for update, calculate the row total with the shared SQL helper, insert/update the parent, delete its previous rows, and insert the new ordered rows. With no rows, validate and use the manual amount. With rows, ignore the supplied manual amount for calculation. Run the final invariant check before returning the authoritative saved transaction; do not catch an error and allow partial work to commit. Preserve created_at and recurring_rule_id when editing; this RPC does not change recurring provenance or transaction ownership.

**Create retries.** Generate the transaction UUID once per new-form visit and reuse it for retries. A repeated create for the same owned UUID returns the saved transaction only if its canonical payload and rows match; a different payload is a conflict requiring reopening the saved transaction. Do not turn a create retry into an unrestricted upsert or create another transaction after a lost response.

The formula exists once in TS and once in a SQL helper. The RPC and constraint triggers call the SQL helper. Existing recurring materialization creates no-row expenses and remains valid under these constraints.

**Queries and cache.**

- Add/update mutations use the RPC and preserve optimistic transaction updates and rollback. Use the same cent-derived total for optimistic amounts and reconcile with the returned saved transaction.
- Add `useTransactionItems(transactionId)` keyed by transaction ID, ordered by position, and gated on a valid ID. Keep pending, successful-empty, and error states distinct.
- Fetch the current parent transaction by ID for editing; route fields are navigation hints, not the source of saved values.
- After create/update/delete, invalidate affected transaction lists, the parent/item queries, and all `monthlyTotals` queries. Keep monthly-total invalidation after recurring materialization too. The existing transaction and recurring hooks now refresh monthly totals; the itemization changes must preserve that behavior and add parent/item cache refresh.
- Do not optimistically replace item-query data unless its prior value is captured and restored on failure. Atomic save prevents partially persisted rows, not stale client caches.

## 6. Mobile form behavior

The existing `TransactionForm` gains an Items section for expenses. It retains no outer padding and uses the current form styles, accessible touch targets, reduced-motion behavior, and scroll/keyboard conventions.

**Rows.** Label, amount draft, kind selection (Item, Discount, Tax, Fee, Adjustment), and delete action. Taxes expose an included-in-prices toggle; adjustments expose a sign toggle. A sign toggle is applied once to the magnitude, not again during summation. Preserve stable local draft IDs while editing; database child IDs may change after replacement. Clear tax/item-only metadata when a row changes kind.

**Add.** `+ Item` adds an Item draft. `+ Discount / adjustment` adds a Discount draft whose kind may change. Disable additions at 100 rows and explain the limit. A blank/invalid draft remains visible and blocks Save; never drop a user's draft to make the form valid.

**Amount.** With rows, display the reconciler's live total read-only. Save is disabled for invalid labels, amounts, metadata, excessive rows, nonpositive totals, pending saves, or unfinished/error loading of edit data. Show the specific reason inline. Removing the last row copies the last valid positive computed amount into the manual draft; if no such amount exists, require manual entry.

**Mismatch.** With rows and a valid printed total, show `Rows add up to $2856.90; receipt says $2866.90` when the cent difference exceeds one. `Add $10.00 adjustment` appends the current signed difference, never a cached original delta; a negative difference produces a negative adjustment. Recompute immediately so the action disappears once resolved. At the row cap, disable the action with an explanation. Without rows, hide mismatch/adjustment UI and permit manual entry. Printed total remains transient form state and is not persisted on the transaction.

**Income switching.** Switching to income hides the item editor and mismatch, makes amount editable, and submits `p_items: []`. A successful expense-to-income save removes persisted rows atomically. Keep the unsaved expense draft in form memory so switching back before saving restores its rows. This draft is never submitted while type is income. The database rejects income with rows even if the UI is bypassed.

### Add Transaction and scans

- Prefill canonical receipt rows and merchant note once for the matching visit. If Gemini has no usable rows but a valid printed total, prefill the editable manual amount from that total and explain that no items were read. A missing merchant leaves the note blank.
- Vision returns no rows and prefills the bounded text note as today.
- Preserve the stored-image handoff and fresh `visit` IDs. Scan results may affect only their originating visit.
- Skip synchronously disables scan prefilling for that visit before exposing manual entry. Late success/failure cannot remount or replace the form, overwrite edits, or navigate away. Ignoring the client result does not imply the server scan was cancelled.
- User edits, leaving the visit, and switching away from expense also disqualify a late prefill. Do not re-key a mounted, edited form on receipt arrival.
- Dropped/capped row warnings invite review of the saved transcription without exposing raw receipt values in logs.

### Edit Transaction

- Every navigation to edit carries a fresh `visit` ID, including reopening the same transaction after cancelling. Updating the Transactions row navigation is the only list behavior change; `key={transactionId}` alone is insufficient.
- Key an inner editor by visit. Load the current parent and its correctly keyed items before mounting its initial form snapshot. Pending/error queries never become an empty row array and never enable Save. Provide retry for loading errors.
- Background refetches do not reset dirty form state. Cache invalidation makes subsequent visits fresh; an explicit reload during an edited visit requires a discard decision.
- Older transactions load successfully with zero rows and retain the normal editable amount.

List presentation, budgets, category reporting, and Settings receipt downloads remain unchanged. Cache refresh and fresh edit navigation are necessary integration changes, not new reporting features.

## 7. Failure behavior

- Gemini structural/truncation failure: attempt Vision once, within existing timeout/quota rules.
- Semantically invalid OCR rows: normalize/drop with counts and a visible review warning. Invalid manual or RPC rows: reject; do not silently change the user's transaction.
- No valid printed total: no mismatch action. The rows still determine an expense amount when present.
- JSON publication failure: settle it before text publication; first response may include in-memory rows, replay may return null receipt. A text-publication failure never leaves a completed scan.
- Storage read/remove errors: preserve retry semantics, distinguish missing objects from operational failures, and keep deleted scans deleted.
- RPC/constraint/lock failure: roll back all database writes and optimistic client state, preserve the draft, and show a safe global mutation error. Never log raw transaction JSON or receipt data.
- Lost create response: retry the same stable transaction UUID and reconcile with the authoritative saved record.

## 8. Verification requirements

Use shared fixture cases for TS and SQL arithmetic. Offline tests must cover failure ordering and races without consuming live OCR calls.

**Pure/Jest:** included versus added taxes; deductions; positive/negative adjustments; per-row half-away-from-zero rounding (`1.005`, `-1.005`); exactly one versus two cents difference; exponent conversion; safe/range bounds; missing/invalid printed total; blank/Unicode labels; metadata normalization; 100 rows across groups; dropped/capped counts; valid/malformed/structurally invalid/semantically invalid Gemini output; `MAX_TOKENS`; provider order and Vision's null receipt; cached envelope validation/versioning.

**Components/hooks:** read-only computed amount; invalid drafts and inline reasons; repeated/current-delta adjustment; zero-row and row-cap behavior; income round trip and empty income save payload; preserving quantity metadata; missing merchant; no-row receipt total prefill; late OCR after Skip/edits/navigation; pending/error item queries cannot save; same/different transaction reopening resets each visit; background refetch preserves edits; authoritative RPC amount, optimistic rollback, item/monthly cache refresh, and stable-ID create retry.

**Storage/edge faults:** replay while JSON is pending returns 409; JSON failure followed by successful text; text failure cleans JSON or records retryable cleanup; status-update failure recovers; deletion during/after publication cannot resurrect JSON; missing JSON versus download error; both-file deletion, partial removal retry, same-image dedupe, old text-only scans, and account-folder purge.

**SQL/database:** exact shared money fixtures; all direct/RPC input constraints including `NaN`, unknown kinds and excessive combined rows; tenant isolation for parent and child operations; anonymous execution rejection; inconsistent direct item/parent writes rejected; income cannot retain rows; atomic replacement rollback; concurrent RPC/direct saves cannot commit mixed rows; last-row deletion and parent cascade succeed; stable create retry/conflict behavior; no-row recurring inserts still work.

**Live integration:** with a user-supplied receipt fixture and a bounded provider call, verify `receipt.totalCents = 286690`, transaction amount equals reconciled rows, foreign-user targets fail, editing replaces rows, both artifacts replay/delete correctly, and provider failure falls back. Supply the fixture through `OCR_TEST_IMAGE`; git-ignored real receipts are not assumed to exist on another machine.

**Documentation:** update CLAUDE.md, AGENTS.md, and README for the table, invoker RPC and invariant triggers, Gemini-to-Vision order, canonical cents/decimal transport, storage publication, and migration setup. Record native phone verification separately from web-preview or bundle-export checks.

## Out of scope

- Per-item reports or categories; splitting receipts across categories.
- Merchant/date auto-categorization or currency detection/conversion.
- Editing rows on income transactions.
- Adding item counts to the transactions list or building desktop layouts.
