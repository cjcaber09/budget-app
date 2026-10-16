# Android test updates

The test APK uses `com.anonymous.budgetmanagement` and the original Android signing key. Install the new APK over the old app to keep its data. Back up the signing key privately. A different key prevents Android from updating the existing app. Git ignores generated native folders and APKs.

This project uses EAS Update at `@ceejaycabs/budget-management`, with the `preview` channel and environment. Updates must match the APK's app version. When native dependencies, permissions, plugins or native configuration change, increment `expo.version` and build a new APK. Increment `android.versionCode` for each APK update. UI code and image changes can use over-the-air updates with the same native dependencies and configuration.

The preview environment contains only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Copy them from the configured Supabase project without committing or printing their values. Keep management tokens, service-role keys and OCR provider keys out of EAS app variables. Run `scripts/configure-eas-public-env.mjs` with the installed EAS CLI file path to copy the two app settings. The script hides command output so it does not log their values.

Publish a compatible update after tests pass:

```powershell
npx.cmd eas-cli@latest update --channel preview --platform android --environment preview --input-dir dist/ota --message "Describe the change"
```

The app checks for updates when it opens. It starts with its saved code and downloads an update in the background. After the download finishes, restart the app to apply it. Install the first APK with update support over the old APK once. The old APK cannot add update support remotely.

The update-status feature adds a compact download banner and **Settings → App updates**, using real download progress when available. When ready, **Restart now** applies the downloaded update; **Later** dismisses the banner while leaving Settings controls available. Restart waits for forms, scans, saves and local draft writes. Failed checks/downloads offer an inline retry; the app remains usable. Web and development builds show an availability note without calling native update APIs. These controls appear only after a version containing the feature is installed. See [implementation and verification](superpowers/plans/2026-10-16-ota-update-status.md).

Published October 16, 2026 (Asia/Manila): Android `preview`, runtime `1.0.1`, source commit `9ae2743`, update group `4ce6324f-af29-4cb5-96af-0880251b1cc6`, update `01a14199-d384-769b-aae4-568aaa8e1b4d`. This includes Overview cards/highlights, form/gesture fixes, transfer account creation and update status. [PR #10](https://github.com/cjcaber09/budget-app/pull/10) contains the source. At publication, the live preview manifest served that update and matched the audited launch bundle and all 29 asset hashes. Direct launch-asset download returned HTTP 403; physical-phone download/reload remains unverified. Existing users should open the app to download, then fully close and reopen it to install this release before the new update controls become available.

Latest release, October 16, 2026 (Asia/Manila): Android `preview`, runtime `1.0.1`, group `5bfd3704-9f22-452c-835a-cbda9d16033d`, update `01a1422d-a9f1-755d-aab0-d7624175995b`, created `2026-10-16T00:47:31.313Z`. Reports adds optional **Hide zero values**, off by default; receipt item lists automatically hide completed valid zero-value rows. Totals, plotted dates and underlying receipt records remain intact. Published from the local worktree based on `b0382a0`; source fingerprint `6842ccfa4d48fb657c27bbec5b1078db8f4e458ed8f37c322cddb6cd71bbe218`. The live preview manifest serves this update and matches the audited launch bundle and all 29 asset hashes. Direct launch-asset download returned HTTP 403; downloaded-byte comparison remains unverified. Physical-phone installation/reload remains unverified. Use **Settings → App updates** to download, then **Restart now** when ready; older versions can download on launch and install after a full close/reopen.

These instructions use local Gradle builds and the original signing key. Before using EAS cloud builds, configure that same key. Do not generate a different key for an existing installation.
