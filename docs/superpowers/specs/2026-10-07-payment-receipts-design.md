# Payment receipts

Implemented scope: mobile iOS/Android; web is a phone preview. Preserve Clear route design and existing budgeting, authentication, quota, storage, replay and recurring behavior. Duplicate-payment warnings are deferred.

## Recognition and review

Schema version 2 identifies purchase, salary, transfer, payment or unknown documents, independently from income/expense/unknown direction and completed/pending/failed/unknown status. Explicit received/credited evidence supports income; sent/debited/purchase evidence supports expense. Names alone do not establish direction. Own-account transfers and conflicting evidence require a choice and offer skipping. Noncompleted proof requires a manual-entry action that clears OCR money before saving.

Payment details contain documentKind, fromName, fromNumber, fromNumberType and reference. Sender identifiers remain strings, preserving leading zeros and masking. Fields are editable even when missing from extraction. References are separate from account/phone numbers.

Principal, netReceived and totalDebited are distinct. A positive counted item flagged isPaymentSummary links the Payment amount field and its row; the Total remains separately visible. Financial summaries accompanying earning breakdowns count once; earnings remain informational. Net summaries exclude already-reflected charges. Without a printed summary, breakdown rows determine the displayed payment amount, which changes through editing those rows rather than adding another counted amount.

## Arithmetic

Use integer cents with half-away-from-zero decimal conversion and exact decimal-string transport. Payment debits become positive magnitudes; type carries direction. Informational rows and included taxes contribute zero. Expense adds items, fees, nonincluded tax and signed adjustments, subtracting deductions. Income subtracts deductions, nonincluded tax and recipient fees. Fees charged to the other party are informational; uncertain fee ownership/counting impact requires an explicit choice. Reconcile only income netReceived or expense totalDebited, never principal as final total. Unknown direction has no authoritative computed total. Positive total and the 100-row cap remain mandatory. Type changes update the last valid manual amount.

## Dates

Prefer a complete, unambiguous transaction/payment date, otherwise receipt issue date. Ignore due dates, payroll periods and screenshot/status-bar clocks. Invalid, incomplete, absent or ambiguous dates use the local calendar day captured when the scan visit starts. Keep that fallback stable through retry, replay and midnight. Show its source and allow correction through a native date picker (validated date input on web).

Persist transaction_date as a calendar date. Month queries and reports use it; legacy null dates use local occurred_at month boundaries. Compatibility timestamps retain scan time for the scan day and use local noon for another selected day. Date edits move cached transactions between months and roll both caches back on failure.

## Persistence and compatibility

Migration 0013 adds payment_details, transaction_date, affects_total, is_payment_summary and fee_party. Owner RLS, parent locking, atomic invoker RPC and deferred direct-write integrity remain. RPC payload_version 2 validates metadata, summary uniqueness/counting, money and dates. Omitted metadata/date preserve existing values; explicit null clears them. Stable create retries compare metadata, date and row flags. Legacy payloads cannot erase protected payment records or introduce income rows. No-row recurring transactions remain supported.

Migration 0014 makes the two fixed-body integrity trigger functions SECURITY DEFINER with empty search paths, allowing restricted Auth account-deletion cascades to remove itemized transactions. The save RPC remains SECURITY INVOKER; trigger functions expose no RPC entry point. A restricted auth-role cascade regression and hosted disposable-user deletion verify this path.

OCR requests explicitly negotiate receiptSchemaVersion 2. Canonical JSON is stored before the text completion marker. Cached totals are recomputed. Legacy clients receive only safe completed purchase expense projections; richer payment scans fall back to text. Old scans upgraded for new clients require classification/date review. Provider failures retain Vision text fallback and existing auth, quotas and cleanup.

## Verification

Domain and component regressions cover net salary detail, sender strings, payment/total linking, ambiguous/noncompleted proofs, fee ownership, scan-date fallback, native picker callback and date-cache rollback. PostgreSQL tests cover typed totals, metadata/date/flags, direct writes, legacy protections, retries and concurrency. Synthetic phone web captures cover light/dark, reduced motion and narrow viewports. Native exports verify bundling; device keyboard, safe areas, picker presentation and screen-reader behavior still require physical-device checks. Live smoke testing uses one supplied purchase receipt plus synthetic payment RPC fixtures under disposable users with final cleanup.
