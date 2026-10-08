# Payment methods, balances and internal transfers

Status: implemented; migration 0019 deployed to the configured Supabase project and remote 0001-0019 confirmed. This supersedes the initial draft.

## Confirmed decisions

- Save the required initial balance with the payment method first. Save the transaction afterward; only a successful transaction save changes the current balance.
- Every bank/card belongs to one user and has its own independent balance. Support multiple banks and cards, including multiple methods with the same bank name. Never share card records, link balances, or automatically merge methods based on names or last-four digits.
- Cash is the default for unassigned and legacy transactions. The system supplies Cash without inventing an initial balance; show Balance not set until the user supplies one. All user-created methods require an initial balance.
- Both Settings and transaction review offer the same creation form. The card form displays: We store only the optional last four digits of your card. Never enter your full card number, PIN, or CVV.

## Method and type

- Method groups: Cash (system default), Card, Bank account, E-wallet and Other.
- Card types: Debit card, Prepaid card and Credit card. Credit cards use an explicit Initial amount owed field and Amount owed display, not a generic funds balance or available-credit claim. Spending adds to debt; incoming payments reduce it. An overpayment is displayed as a credit balance. A credit limit and available-credit calculation are outside this scope.
- Other methods collect a payment type and name/provider. Card last-four is optional and accepts exactly four ASCII digits or blank. Never truncate a pasted full number to four digits. Reject full-card-number patterns in name/type fields as well.
- Show the selected method in transaction review and transaction history. Keep all payment-method metadata separate from receipt sender/reference details; OCR never chooses a method automatically.

## Initial and current balances

Keep the original initial balance as an audit reference; transactions update the current balance, not that starting reference. Capture the balance baseline on the server when the initial balance is saved, rather than asking the user to choose a midnight opening date.

For a newly created method, save its required initial balance first and then save the reviewed transaction against it. Failed transaction saves leave that balance unchanged; the successfully created method remains available for retry. Creating a method alone never saves the transaction.

Track when transactions are assigned to each method. Existing Cash history before Cash's first balance baseline is not subtracted again. Transactions newly recorded or assigned after a baseline contribute once to that method's balance, including backdated receipts. Transaction dates still determine budget months. Future-dated transactions contribute only when their financial date arrives; balance reads use the profile timezone. Retrying a save must not create a second contribution.

Amount/type edits, reassignment and deletion recalculate eligible contributions. Reassignment removes the old eligible contribution and adds the new one atomically; a pre-baseline contribution is not reversed from the old method. Preserve assignment time for ordinary edits and reset it only when the method changes. Old-client edits that omit the method preserve an existing assignment; genuinely unassigned records use Cash.

Budget income/expense totals, allocations and Safe to spend are independent of initial balances, corrections and internal transfers. Do not introduce a global total-funds figure that could imply linked physical accounts.

## Balance corrections

- Before the method has activity, permit correcting a mistaken initial balance.
- After activity exists, require confirmation before editing the initial balance; preserve the baseline and explain the resulting recalculation.
- Provide a separate balance-correction action for later reconciliation. Store an auditable correction rather than fabricating an income or expense. Serialize it with transaction changes, calculate the delta server-side, and make retries idempotent.
- Do not silently move the baseline to exclude existing history when correcting the initial amount.

## Internal transfers

Bank account is the method; transfer is an operation. Add an explicit transfer-between-methods flow with source, destination, amount, date and optional note. Source and destination must differ and belong to the same user.

Store an atomic transfer outside budgeting income/expense records. Debit the source and credit the destination exactly once; edits and deletion reverse/reapply both sides together. Credit-card repayment uses this transfer flow so spending is counted when charged, not counted again when the card is paid. Future transfers affect balances on their financial date. Cash participates even while its initial balance is unset, but continues to display Balance not set until configured.

## Recurring bills

Allow selecting a payment method on recurring bills, defaulting to Cash. Generated transactions inherit the method selected for that occurrence. Changing a bill's method affects future outstanding occurrences only; recorded expenses keep their original assignments. Recording or linking an existing expense preserves that expense's selected method. Reminder content remains independent of account balances.

## Archive and failure behavior

Cash cannot be archived. Archived methods stay in history and retain tracked balances; existing transactions may preserve their assignment, but new assignments and transfers to/from an archived method are blocked.

Before archiving, identify active and paused unarchived bills and outstanding/replacement occurrences that reference the method and require reassignment to an active method or Cash. Apply reassignment/archive atomically. Historical transactions do not change. Restore remains available.

If method loading fails, keep the saved transaction selection and its draft. Never silently replace an existing method with Cash. Expose retry beside the selector. Default Cash remains available for genuinely new/unassigned records.

## Mobile flows

Settings provides method creation, viewing balances, editing, corrections, archive/restore and transfer-between-methods. Transaction review offers a picker with Cash and active methods, plus Add payment method. Use a single slide-up container that switches between picking and creation without presenting overlapping native modals. Cancelling creation preserves the transaction draft and selection. Saving the method selects it; the transaction still requires its own Save.

## Completed implementation sequence

1. Finalize schema and owner-scoped RPC contracts for methods, baselines, transaction assignment timestamps, corrections, transfers and recurring-bill inheritance.
2. Implement authoritative balance aggregation and atomic/idempotent write paths, preserving existing transaction/items/receipt/bill behavior and complete budget totals.
3. Add reusable creation/picker, Settings management, correction/transfer flows and transaction/history labels with the established mobile design and reduced-motion behavior.
4. Verify SQL ownership/integrity/concurrency and balance math; verify UI draft preservation and recovery; review phone light/dark captures and native/web exports.
5. Deploy only the validated migration to the app's configured Supabase project, then run synthetic post-deployment checks. No real-bank connection, full-card data, or live OCR upload is involved.

## Required verification

Required initial balance; optional/blank/invalid/pasted last-four; privacy note in both entry points; multiple independent methods; debit/prepaid/credit semantics and overpayment; Cash initialization without historical double counting; same-day/backdated/future records and timezone boundaries; CRUD/reassignment/old-client omission; stable retries; complete aggregation beyond 1,000 records; owner isolation; atomic transfer/correction concurrency; credit-card repayment without double budgeting; recurring inheritance and future-only changes; archive/reference resolution; load/save failures and preserved drafts.

## Completed verification

- 242 Jest tests across 36 suites, TypeScript and lint pass. Final iOS/Android Hermes and web 28-route exports pass (.impeccable/payment-export-final).
- Hosted rollback-only scripts/payment-methods-sql-test.mjs --deployed covers required initial balance, last-four validation, exact retries, ownership, money semantics, Cash baseline, credit/transfers/corrections, recurring assignments and aggregation beyond 1,000 records.
- scripts/payment-methods-concurrency-test.mjs verified concurrent exact retries produce one record and one contribution; its synthetic owner was deleted. Anonymous requests to five new RPCs were denied with 401/42501.
- Deployment confirmed remote 0001-0019. A harmless CLI catalog-cache/missing-Docker warning followed successful push; no Docker was used.
- Root reviewed 12 synthetic 390px light/dark phone captures plus four refresh-error/recovery captures in .impeccable/review/payments-*. Settings/transaction creation and selection, transfers, corrections and picker rendering showed no runtime exceptions. Failed correction refresh retained the draft and recovered successfully. Independent review accepted the refresh-message fix and approved verified mobile web scope.

Physical-device keyboard, safe areas, native picker/sheet presentation and accessibility remain unverified. DESIGN.md and .impeccable/design.json preserve the incumbent identity and tokens. No commit, push or update to existing PR #2 was performed.
