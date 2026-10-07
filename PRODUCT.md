# Budget Tracker

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Mobile-only Expo React Native app for iOS and Android. The web build is a phone-layout development preview; the user explicitly excluded desktop design.

## Users

People tracking their personal monthly spending and category budgets. The repository describes a personal finance app; more specific audience demographics are undecided.

## Product Purpose

Let a user log income and expenses, set independent monthly spending limits, compare category allocations, understand safe spending capacity and daily pace, inspect reports, and maintain scheduled expenses.

## Operating Context

Users sign in with Supabase Auth. Four primary screens are Overview, Transactions, Reports, and Settings. An add-transaction action offers manual entry, a receipt photo, or an uploaded image. Receipt recognition prefills purchase, salary, transfer and payment details for review, including direction, sender identifiers and receipt date (or scan-day fallback). Income and expense rows determine the amount; informational detail is excluded; manual expenses can use the same editor, and saved rows can be edited later.

## Capabilities and Constraints

- Keep existing budgeting, transactions, category editing, recurring rules, notifications, receipt scanning, and authentication workflows. The user confirmed all existing screens, then clarified the scope is mobile only.
- Keep the Expo Router navigation structure and the tab bar on nested editing screens.
- One account currency unit, chosen from ten supported two-decimal currencies. Changing it relabels existing numbers without conversion; no exchange-rate or multi-currency claims.
- Supabase data belongs to the dedicated budget_tracker schema. Receipt rows use owner RLS and an atomic invoker save with database integrity checks.
- OCR uses quota-limited Gemini structured extraction with Cloud Vision text fallback; preserve provider privacy disclosures and image handling.
- Client-triggered atomic SQL catch-up materializes recurring transactions; no server cron.

Profiles synchronize display name, private avatar, appearance and financial timezone; signed-in users can change their password. Guidance reserves scheduled bill occurrences and estimates spending pace without claiming bank balances.

## Evidence on Hand

README.md, CLAUDE.md, AGENTS.md, app/, src/, the design spec at docs/superpowers/specs/2026-07-17-budget-tracking-app-design.md, and .superpowers/sdd/progress.md. No customer testimonials or marketing claims are supplied.

## Product Principles

- Make spending and budget status easy to read accurately.
- Give each action a clear, consistent affordance.
- Preserve native navigation, safe areas, font scaling, and keyboard access.
- Keep motion purposeful and responsive, with reduced-motion support.

## Brand Commitments

The product name is Budget Tracker. The user requested Impeccable for the redesign and Emil Kowalski's principles for motion. No palette or typeface is pinned.
