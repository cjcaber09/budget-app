# OTA update status and deliberate restart

Implemented scope: optional download feedback and Settings controls for the installed phone app. Existing automatic startup download behavior, update channel and runtime compatibility remain unchanged.

- An inline banner beneath the main-page heading shows actual SDK download progress. Unknown progress uses a spinner, or a static download icon with Reduce Motion. Finishing a download does not imply readiness until the SDK reports a pending update.
- A ready banner offers Restart now and Later. Later hides that update's banner for the session; a different downloaded update can show it again. The App updates Settings tab retains access. That tab uses its own controls without duplicating the banner.
- Settings supports checking, downloading an available update, quiet check/download retry, readiness, restart retry and the last check time for the current session. Unsupported web/development clients never invoke native update APIs. No update IDs, provider errors or internal configuration appear in the UI.
- A single provider observes the existing SDK state. Manual requests are serialized and wait for startup work, preventing duplicate checks/downloads. Rollback directives are recognized. No automatic reload, polling or change to update delivery policy is introduced.
- Restart is a deliberate action from a primary tab while the app is active. It is blocked by keyboard entry, nested routes, open sheets/help, unsaved budget/profile changes, scans/pickers/uploads, pending financial mutations, unconfirmed transaction/transfer/method saves, and account reset/deletion. It waits for serialized local draft writes and rechecks current owner, route and work immediately before reloading. A successful reload request stays locked because the SDK promise resolves before the native reload is posted.
- UI uses the existing warm surfaces, forest actions, system type, 48px controls, phone layout and Reduced Motion. Banners remain in document flow and do not overlap the FAB, tab bar or page content.

Primary API reference, checked against installed expo-updates57 types and implementation: [Expo Updates](https://docs.expo.dev/versions/latest/sdk/updates/), [Downloading updates](https://docs.expo.dev/eas-update/download-updates/).

Verification uses Jest coverage of native mapping, rollback/no-update results, progress, errors/retries, Later/new-update behavior, duplicate requests, draft-write settling, owner changes, active-work guards and reload locking; TypeScript and Expo lint; production web/Android/iOS exports; and synthetic native-state browser checks in phone-sized light/dark layouts. Real device downloading and reload still require an installed compatible phone build.

No database migration, dependency, native configuration or runtime change is required. This feature becomes visible after an app version containing it has been installed. No publication is part of this task.

## Verification results

Full Jest: 592 tests in 108 suites passed. Final UI/navigation rerun: 16 tests in three suites passed; the final native-adapter test passed after switching it to the hook harness. TypeScript, uncached Expo lint, focused new-test lint and whitespace checks passed.

Production web and Android/iOS Hermes exports passed in `dist/update-visual-verified`. All 96 files passed public-configuration/private-value exclusion auditing, and the native bundles include Expo Updates. Runtime remains 1.0.1.

Synthetic native update events in the real production web app passed light390/dark360, normal and Reduced Motion: actual percentage rendering, indeterminate status, ready/Later, Settings navigation, preserved profile drafts with disabled restart, check/download/reload errors and retries, one successful restart request and no horizontal overflow. Current screenshots were inspected. Runtime checking caught a React Native Web accessibility mapping gap; the progress bar now exposes explicit ARIA minimum, maximum and current values as well as native accessibility values.

ADB reported no connected device. Actual native update delivery, download meter events and reload behavior remain unverified on a phone. No OTA publication, APK build, hosted migration, source commit or push was performed.

## Authorized release follow-up

The subsequent request to create the PR and publish OTA was completed on October 16, 2026 (Asia/Manila). Source commit `9ae2743` is in [PR #10](https://github.com/cjcaber09/budget-app/pull/10), covering Overview, form fixes and update status. The earlier transfer PR #9 was initially open but became merged during release, so a fresh branch and PR keep the newer changes reviewable. No PR was merged by this release task.

Published the audited Android export to the existing `preview` channel/environment on runtime `1.0.1`: group `4ce6324f-af29-4cb5-96af-0880251b1cc6`, update `01a14199-d384-769b-aae4-568aaa8e1b4d`, created `2026-10-15T22:06:02.628Z`. The export is newer than application sources; preview public settings match the bundled configuration and no private environment values occur in staged files or release assets. No native or database changes were needed for this publication; migration 0036 was already deployed.

The live preview manifest serves the new update and matches the audited launch bundle SHA-256 and all 29 asset hashes. Direct launch-asset download returned HTTP 403/text-html, so downloaded-byte comparison and physical-phone installation remain unverified. No APK, iOS OTA, merge or real financial data write was performed. Users on the previous version must download and restart once before these update controls can appear.
