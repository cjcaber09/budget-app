# Profile and monthly spending guidance

## Approved scope

Mobile-only Clear route extension using the existing Impeccable system. Profile includes display name, private avatar, read-only email, and password change. Preferences are account-synced System/Light/Dark appearance, a two-decimal currency unit, and IANA financial timezone. Currency relabels existing values without conversion after confirmation. Existing accounts preserve USD; first profile initialization takes the device timezone without overwriting another device's profile.

Historical decision: independent monthly limits initialize existing budgeted months from category sums. Current months inherit the latest earlier limit only when unset. Future months preview inheritance without writing until edited; explicit zero remains distinct from missing. Category allocations stayed independent, with unallocated and excess amounts shown.

Superseded by [Combined category budget cap](2026-10-08-combined-budget-cap.md), implemented in migration 0020: the monthly allowance now caps combined category budgets. Missing allowances block new/increased positive allocations; saving against future inheritance freezes the target allowance. Legacy excess is repaired through strict reductions, and invalid lower automatic inheritance is skipped. The earlier independent, uncapped category-allocation decision no longer applies. Spending guidance and bill reservations remain unchanged.

## Calculations

All guidance uses integer cents. Remaining budget is limit minus all expenses in the selected calendar month. Safe to spend clamps remaining minus outstanding/replacement recurring commitments to zero, showing any shortfall separately. Daily allowance divides by remaining days including today and rounds down. Average spending includes zero-spend days through today.

Forecast equals spent through today plus future recorded expenses plus outstanding commitments plus max(0, discretionary daily average times days after today minus already-recorded future discretionary expenses). Recurring-source and occurrence-linked expenses are excluded from discretionary extrapolation. Ahead is below95% of the limit;95–100% is on track; above100% is over. Missing limits have no authoritative allowance/status. Past/future months have no current daily pace. Estimates do not claim bank balances or verified bank payments.

## Persistence

Migration0015 adds owner-RLS profiles/monthly_limits, timezone validation, private JPEG avatar Storage policies and profile Realtime publication. Profile updates patch only changed fields. Avatar replacement compares the previous path before publication; failed new uploads and old images are removed, with retry controls for cleanup failures. Signed URLs renew. Deleted-account purge includes both OCR and avatars while retaining fail-closed auth lookup.

Migration0016 adds anchored monthly schedules, soft archives, pause metadata, and owner-scoped recurring_occurrences. One occurrence links to one expense. Amount differences require explicit full-settlement confirmation; partial payments are out of scope. Direct legacy schedule writes and recurring transaction mutations are rejected. Owner-checked fixed-search-path RPCs use a common advisory owner lock; deferred invariants protect associations. Ordinary save_transaction remains invoker and compatible; linked expense edits use bill_command.

Due expenses are automatically materialized once through prepare_dashboard. Skip deletes the linked expense and prevents regeneration. Replace deletes it but keeps a reserved replacement state that catch-up cannot regenerate automatically. Income conversion unlinks and skips atomically. Record/link settles the occurrence; immutable scheduled identity survives actual date edits. Archive retains history. Pause excludes its unrecorded occurrences; resume avoids generating missed paused-period expenses and regenerates only paused future previews, preserving explicit user skips. Schedule changes replace unrecorded future commitments and preserve recorded history.

Migration preserves legacy next dates and derives anchor from the existing day, without guessing a lost month-end anchor. Matching legacy recurring records associate one deterministically; other financial records remain counted and receive a review warning.

Migration0017 adds an invoker dashboard_snapshot with server aggregation in one SQL snapshot, avoiding PostgREST row-limit truncation, and monthly_expense_totals for reports. prepare_dashboard must succeed before authoritative guidance. Snapshots include date/timezone/completeness, amounts, category aggregates, and bill occurrences.

## Dates and client behavior

Financial day and legacy timestamp/month bounds use the chosen timezone through @date-fns/tz. Explicit transaction dates remain unchanged. Scan visits capture date/timezone together. Native date selection extracts the calendar date in device time before saving the explicit date, avoiding cross-zone shifts. ProfileGate sits inside tab screen layouts so the root navigator always mounts and deep links survive profile loading.

Transaction list keys include owner/month/timezone, and optimistic mutations share key factories. Preferences refresh through Realtime and foreground fetch; account changes clear caches. Dashboard and report clocks refresh on resume/day rollover. Every related mutation invalidates guidance. An upcoming bill can link an existing expense from another month through the month selector.

## Verification and limits

Jest covers profile controls/password verification, forecast overlap, zero/missing limits, historical/future months, timezone/DST, and existing receipt behavior. Isolated PostgreSQL checks cover lifecycle, ownership, legacy rejection, exact retries, concurrent catch-up,1001-row aggregation, and restricted Auth deletion cascades. Phone web captures use synthetic fixtures and cover390/360px light/dark and reduced motion. Native exports establish bundling, not device picker/photo-permission/keyboard/screen-reader behavior. Hosted checks use synthetic data only, with throwaway-user and file cleanup; no receipt upload is required for this feature.
