# Phone notifications and recurring bills

Implemented 2026-10-08. This records the shipped behavior of migration 0018 and the native notification client.

## Budget alerts

Native iOS and Android can notify at 80% and 100% of a category allocation or independent monthly limit. Alerts use the current financial month, regardless of the month being browsed. Only complete server dashboard data and successfully settled budget queries are eligible; loading, fetching and error states do not trigger alerts.

The first eligible sync after enabling alerts establishes a silent baseline for existing spending. Owner/month threshold levels persist on the device. Subsequent months start from zero; a jump across both thresholds sends only the stronger alert. Refunds do not reset a reached threshold and cause duplicate alerts. Alerts run when spending syncs, without a background server push service.

## Bill reminders

Visible recurring-rule labels now say Bill or Recurring bill; route, table and hook identifiers remain unchanged. Bills retain their existing automatic due-expense recording and settlement semantics. Each bill can enable a reminder on the due day, one day before, or three days before, at a validated 24-hour HH:MM time in the profile's financial timezone. Defaults are reminder off, one day before and 09:00.

Migration 0018 adds profile notification preferences, bill reminder configuration, an updated owner-checked save RPC and phone_notification_snapshot. The snapshot returns the nearest 48 future reminders within 30 days. Paused, archived, skipped or settled occurrences are excluded; missed reminder times are skipped. The client reconciles one-off schedules, cancelling obsolete entries and preserving matching ones. Reconciliation waits for saved preferences and the correct owner/timezone snapshot, runs on app activation and periodic foreground refresh, and supports a manual refresh.

Turning reminders off or signing out cancels scheduled bill reminders on that phone. Another device's edits cannot update this phone's local schedule until it next syncs. Phone operating systems may delay delivery; the app does not guarantee exact delivery time.

## Settings, privacy and navigation

Settings offers Budget alerts, Bill reminders and Hide details on lock screen, plus permission status, phone-settings recovery, test notification and reminder refresh. Notification details are private by default. Android uses separate budget and bill channels; iOS provisional permission is accepted. Web explains that configuration/testing belongs in the phone app and disables notification toggles.

Cold and warm notification taps require the current owner and valid UUIDs. Category alerts select their month and open the budget; monthly alerts select their month and open Overview; bill reminders open a fresh bill-edit visit. Pending owner preferences do not authorize another account's tap.

## Scan history

Only Scan history gains Load more. An owner-scoped infinite query returns 20 rows per page, with a 21st lookahead and a descending (created_at, id) cursor to handle tied timestamps. Loaded pages remain visible during retries. Other lists retain their existing presentation.

## Verification and limits

215 Jest tests across 33 suites pass, with TypeScript and lint clean. Final iOS/Android Hermes and web exports (28 routes) pass. A reusable rollback-only hosted SQL check verifies reminder configuration, invalid offsets, timezone conversion, skipped/paused cancellation, owner isolation and integrity. Migration 0018 is deployed to the configured Supabase project; remote migrations 0001-0018 are confirmed, and anonymous REST access to the exposed RPC is denied (401/42501).

Eight synthetic 390px light/dark phone web captures were reviewed; Scan history expanded 20 -> 40 -> 45 and reminder form interactions ran without runtime exceptions. Independent finish review approved the verified phone web scope. Physical-phone permission prompts, notification delivery and tap behavior remain unverified. No Docker was used for these notification checks. No identity, design-token or generated-asset change was introduced.
