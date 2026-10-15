# Account activity, repeat transactions, local drafts and Total cash

User requested searchable payment-method activity, quick repeat, device draft recovery and combined Total cash on Overview. Preserve the existing mobile design, financial contracts and prior UI fixes. No database migration or release is required for these client features.

## Account activity

Payment-method details offers Activity inside its existing sheet. A local month selector and search cover complete recorded income, expenses, refunds, transfer principal and balance corrections. Four filters are All, Transactions, Transfers and Corrections. Cash includes explicit Cash IDs and null assignments; other methods match IDs, never names. Transfers are separate from spending; their source fees remain separate expense rows. Corrections use the financial timezone and are excluded from income/spending. Category labels enrich search.

Use existing complete monthly report transaction/transfer RPC envelopes plus owner-scoped payment-method correction snapshots. Do not reconstruct a running balance from recorded history: pre-baseline and future records may not affect current balances. Errors hide incomplete lists, retain search/filter and offer retry. No pagination controls or rendered-list exports.

## Repeat

Ordinary transaction details offers Repeat transaction. A fresh new-form visit loads the owned current parent, items and available selections before hydration. Copy type, amount, note, category and item rows; default to today's financial date. Clear payment references, attachments and all bill/recurring provenance. Refunds, transfer fees and linked bill payments are ineligible. Archived/missing methods fall back to Cash with an explicit review notice; unavailable income sources become unspecified with a notice. Review and save through existing transaction RPC, balance review, exact create UUID and cache invalidation. Nothing is saved automatically to the server.

## Device draft recovery

Keep one unfinished manual/repeated new transaction per owner in AsyncStorage (native) / local storage (phone-web preview), under a versioned owner key. This is unencrypted local storage and does not sync to Supabase. Keep raw input text, item-editor partial rows/unit-price text, selections, calendar date, captured timezone/currency/start context and create UUID. Explicit Resume draft / confirmed Discard precedes a new entry; never silently replace the prior draft. Scan visits, bill forms and edit forms remain excluded. Files, image URIs, OCR text/context identifiers, passwords, recovery codes and sender/reference metadata are not persisted; proof files must be reattached after a restart.

Before a server create, persist the exact validated input and keep the same ID/timestamp on retry. An uncertain attempt resumes with Retry same save / Check whether it saved, not an editable new create. Successful owner-scoped existence checking opens the saved record; a successful absent read reopens the same-ID draft for review. Missing/expired auth and read failures never count as saved. Clear the draft after confirmed transaction save, explicit discard, sign-out/account switch and Clear records. Serialize writes/removals, invalidate old form leases on clearing, and prevent late old-save cleanup from deleting a newer draft. Reject paused/deleted owner writes and corrupt/oversized/foreign data. Storage failures retain the in-memory draft and prevent sending an unpreserved new request.

## Total cash

Overview shows the current combined signed balances of owned active Cash, bank-account, wallet and debit/prepaid methods. Exclude credit cards, Other and archived methods. Duplicate names remain independent. Calendar-month selection does not change the current total. Decode exact decimal balance strings and sum safe integer cents without the single-transaction cap; format with the reactive saved currency. Any unset included balance suppresses the partial total and links directly to Settings Sources. Errors and loading never fabricate zero. These are manually tracked balances, not bank-connected available funds or Safe to spend.

## Verification

Targeted domain/component/storage tests cover owner isolation, 1004-row activity, transfer fees, correction dates, repeat exclusions, partial item drafts, archive recovery, failed storage, reset leases, same-ID restart retries, eligible Total cash, unset/zero/error and aggregate ranges. Run Jest, TypeScript and lint; inspect synthetic 390px light and 360px dark phone web flows. Native keyboard, screen-reader, app-kill persistence and safe-area checks remain device verification work. No real account changes, APK, deployment, OTA or publication are authorized by this implementation request.
