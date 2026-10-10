# Combined category budget cap

Status: implemented and deployed (migration 0020; remote 0001-0020 confirmed).

The monthly allowance is the maximum combined category allocation for that month.
Category budgets may total exactly the allowance, but may not exceed it.

- Require an allowance before creating or increasing positive allocations.
- Compare the edited amount with the sum of all other categories; retain decimal precision.
- Reject lowering the allowance below existing combined allocations.
- Serialize both write paths under the owner financial lock and reject direct authenticated writes.
- Current/future allocations may inherit the latest earlier allowance. Saving an allocation within that inherited allowance freezes it for the target month so subsequent earlier-month edits cannot invalidate it.
- Preserve existing records. If legacy allocations are already excessive or lack an allowance, allow strictly decreasing an existing category budget to repair them, while preventing increases. Show the problem and the remaining allocation capacity.
- Keep transaction spending, tracked balances and bill calculations unchanged. Spending may exceed a budget; this cap controls budget allocations.
- Preserve drafts on errors and load the current category budget before editing. Every budget edit visit starts fresh.

Verify exact-cap/over-cap edits, allowance reductions, zero/missing allowance, inherited months, legacy repair, ownership and simultaneous writes. Verify mobile form/error behavior and retain app tests, TypeScript and lint checks.

## Implemented behavior

`set_category_budget` and `set_monthly_allowance` serialize writes under the owner financial lock. Authenticated direct budget/monthly-limit DML is revoked; SELECT remains available. Strict reductions repair legacy excess or missing allowances. Automatic inheritance skips a lower allowance that would invalidate existing allocations, preserving dashboard availability.

Category taps open a read-only budget value with an Edit action and a complete selected-month category transaction list. Fresh visits, current-budget hydration, available capacity and draft/error recovery are retained. Shared date fields preserve native pickers and use `type=date` with `showPicker` on web; invalid calendar values are ignored and Next due date labels are explicit. Overview's transparent 48px top-right bell opens the upcoming bills sheet and shows an 8px danger dot at bottom right for selected-month outstanding/replacement bills. Inline bills are removed; Record/Link/Skip and reserved totals/Safe to spend remain unchanged. Profile email remains noneditable without the redundant read-only helper sentence.

## Verification

- 250 Jest tests across 40 suites, TypeScript and lint pass.
- Hosted rollback checks (`node scripts/combined-budget-cap-sql-test.mjs --deployed`) pass for missing/zero/exact/excess allowances, monthly decreases, future inheritance, ownership, direct-write denial and legacy repair.
- Concurrent two-category writes of 60 against an allowance of 100 accept one write, leaving combined allocation 60 (`node scripts/combined-budget-concurrency-test.mjs`); synthetic owner removed. No Docker or OCR provider call.
- Ten synthetic 390px light/dark phone captures and interactions verify cap validation, read-only budget detail/filtered transactions, bills sheet and browser date input without runtime exceptions. The final amount-alignment fix was rechecked with a long category/note and 1245.80 in both themes. Independent review disposition: ship at verified phone web scope.
- Final iOS/Android Hermes and web 28-route exports pass (`.impeccable/allowance-export-final`). Physical-device native pickers, keyboard, safe areas and accessibility remain unverified.

The incumbent DESIGN.md and .impeccable/design.json identity, tokens and assets remain unchanged.
