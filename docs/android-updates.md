# Android test updates

The test APK uses `com.anonymous.budgetmanagement` and the existing local Android signing key. Installing a matching signed APK over the existing installation updates the app without uninstalling or clearing its data. Keep the signing key backed up privately; replacing it prevents in-place updates. Generated native folders and APKs are ignored by Git.

EAS Update is linked to `@ceejaycabs/budget-management`, on the `preview` channel and environment. Runtime compatibility uses the app version. **Increment `expo.version` and build/install a new APK whenever native dependencies, permissions, plugins or native configuration change.** Increment `android.versionCode` for APK updates. JavaScript/UI and bundled-asset changes can use OTA updates within the same native runtime.

The preview environment contains only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Set them from the configured project without committing or printing their values. Do not copy Supabase management/service tokens or OCR provider keys into EAS app variables. The local helper `scripts/configure-eas-public-env.mjs` takes an installed EAS CLI entry-point path and copies only those two public app settings into the linked preview project, with CLI output suppressed.

Publish a compatible update after tests pass:

```powershell
npx.cmd eas-cli@latest update --channel preview --platform android --environment preview --message "Describe the change"
```

The release app checks on launch, uses its cached/embedded bundle immediately, and downloads updates in the background. Close and reopen it again after download to apply the update. The first OTA-capable APK must be installed over the old APK once; the old APK cannot gain this capability remotely.

These instructions use local Gradle builds and the original local signing key. An EAS cloud build needs the same signing credentials configured first; do not generate a different key for an existing installation.
