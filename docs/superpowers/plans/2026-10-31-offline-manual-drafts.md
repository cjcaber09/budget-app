# Offline manual transaction drafts

## Scope and behavior

One owner-scoped local draft for manual/repeated income or expense, using the existing draft format, stable transaction UUID and serialized storage. A draft can be incomplete and does not affect confirmed transactions, balances, budgets, reports or notifications. Reconnection never submits it. Scan and bill forms and existing-record edits remain outside draft recovery. Transfer drafts retain their existing recovery behavior and need internet for entry/submission.

Connectivity uses NetInfo on native and browser online/offline events on web. These are hints; submission also verifies the signed-in user and refreshes profile, categories, methods and income sources. Cached choices are IDs/labels, archived flags and financial currency/timezone only, with a saved date; balances, activity, files and credentials are excluded. Owner validation, whitelisting, serialized writes and generation guards isolate and clear the cache on sign-out, account changes, financial reset and deletion cleanup. ProfileBootstrap can use the saved owner currency/timezone while remote preferences load; authorization remains independent.

Open the app online once to cache choices. With a recoverable signed-in session, open Add transaction → Manual Entry while offline, enter text/items and select cached choices, then choose Save draft or wait for successful autosave. After restarting, use the same route and Resume draft. Without saved choices, manual drafts still accept text and items with category selection deferred. Save draft permits incomplete fields. Only completed local writes show Saved on this device; failed writes keep the current editor and offer retry. Local drafts now use authenticated AES-256-GCM encryption and clear on sign-out; see the local-security/setup/reminder plan for key storage and migration behavior. Proof files must be reattached after restarting.

Online submission checks current owner, category and method availability and optional income source. It blocks a changed currency rather than silently relabeling a draft. Server RPCs retain final authority for money, balances and write eligibility. Review errors remain independent of autosave status. Uncertain saves retain the exact original request and retry/recovery UI. New-transaction mutations use networkMode always to prevent TanStack pausing a write and submitting it on reconnection.

## Native compatibility

NetInfo 12.0.1 is the Expo-selected dependency. App/runtime moves to 1.0.2 with Android versionCode 6; appVersion runtime policy is unchanged. Existing runtime 1.0.1 installations need a new native build, not an OTA containing this code. Local generated Android version/runtime values match app.json; signing material is unchanged. No build publication or deployment is part of implementation.

## Verification

- Recovery after unmount/restart, incomplete offline entry, explicit/local save failures and retry, and no write on reconnection.
- Revalidation failures, exact retained request retries, owner mismatch, malformed cache, omission of balances/secrets, storage failure and late writes after reset.
- TypeScript, lint, full Jest, production web and Android/iOS Hermes exports.
- Synthetic phone web at 390 light / 360 dark: online cache capture, offline draft save, full reload, Manual Entry → Resume draft, cached account selection, no overflow, reconnection without submission and identical lost-response retries. Browser assets remain locally served; this tests the phone-layout preview, not offline browser hosting.
- Physical-phone airplane mode, process termination, expired-session recovery, keyboard and accessibility remain unverified. Existing AuthGate still requires a recoverable signed-in session; this feature does not bypass session failures or enable offline sign-in.
