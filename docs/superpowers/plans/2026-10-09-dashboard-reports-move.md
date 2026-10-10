# Simplify Overview and improve Reports

Status: implemented on 2026-10-09; changes are uncommitted. The separate [Reports expansion](2026-10-09-reports-expansion.md) remains approved and not implemented.

## Confirmed screen changes

Overview keeps monthly allowance/remaining budget, Safe to Spend and its per-day amount, Income/Expenses/Net Income, the upcoming bills bell, and over-budget alerts. Alerts open the read-only category detail; View reports stays visible.

Reports contains, in order:

1. Budget vs Actual: category allocations/spending, progress/status, remaining or overage, allocation total and category-detail links.
2. Existing category spending donut and percentage legend.
3. Current-financial-month Daily Spending Pace: average, forecast/status, and horizontal forecast-versus-allowance bars.
4. Six-month Expense Trend: straight line, subtle area fill, visible monthly points, and accessible monthly amounts.

Sections use shared mobile card styles. Category creation remains available in Reports' empty state and Settings.

## Data and behavior

- Overview and Reports use complete dashboard snapshot totals instead of loading transaction histories for reports. Categories and budgets remain existing queries.
- Extracted DailySpendingPace preserves spendingGuidance calculations. Monthly allowance editing and Safe to Spend remain on Overview.
- Forecast comparison uses the larger of forecast/allowance as its scale; overspending stays visible. Zero and unset allowances remain distinct.
- The trend stays anchored to the current financial month, explicitly displays its range and marks the last month in progress. Recorded future-dated entries are included.
- The trend uses the installed react-native-svg package, measures available width, draws straight segments with a static translucent area, and lists readable monthly amounts. No new dependencies or decorative motion.
- Failed queries show section-local retry rather than fabricated zero totals. Successful zero-expense history has its own empty message and zero monthly values.
- Category percentages retain their current denominator, clearly labeled share of categorized expenses. Uncategorized and zero-spend completeness belong to the next phase.
- Fresh category visits return Back to their originating tab. Phone-alert handling remains in the tab layout.
- Owner-scoped financial preferences gate only the aggregate query, not navigation; removed the profile-free capped transaction fallback.
- Successful dashboard preparation invalidates monthly aggregate history because bill catch-up can materialize expenses. It does not invalidate itself or create a query loop.
- Existing RPC interfaces, database schema, allowance caps, notification thresholds and financial calculations are unchanged.

## Verification

- 266 Jest tests across 43 suites pass, covering relocation, section errors, authoritative totals, delayed owner preferences, account switching, current-month pace, zero/unset allowance and transaction/bill-driven aggregate refresh.
- TypeScript and lint pass.
- Production iOS/Android Hermes and web 28-route exports pass; artifacts are in the local temporary directory, outside repository tracking.
- Synthetic phone web checks pass at 360px and 390px in light/dark themes, including reduced motion, fresh read-only category visits, Back to Reports, historical pace omission, measured trend width, successful zero history and trend error/retry recovery. No real financial data or provider calls.
- Independent Impeccable finish review: ship at the verified phone web-preview scope; no material fixes.
- Physical-device screen-reader behavior, font scaling, safe areas and motion/performance remain unverified. Browser captures are phone-layout web evidence only.

## Deferred features

At the relocation milestone these features were deferred. The [Reports expansion plan](2026-10-09-reports-expansion.md) has since implemented detailed cash flow, dedicated income breakdown/history, daily/weekly trends, historical category performance, all-category percentages, payment-method spending and previous-month comparisons. The twelve-month selected-period trend supersedes this plan's original current-anchored six-month trend; Transactions retains its existing income history.

## Follow-up layout adjustment

Overview centers its month selector and places budget alerts above it. User correction: the three-column grid belongs to Budget vs Actual, with a spending-versus-budget doughnut per category and extra rows as needed. Spent, budget, remaining/overage and status stay visible. Zero or missing budgets show No budget; overspending fills the ring but retains its explicit above-100% usage/overage. Spending by Category returns to its list legend.
