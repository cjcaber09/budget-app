# Android test updates

The test APK uses `com.anonymous.budgetmanagement` and the original Android signing key. Install the new APK over the old app to keep its data. Back up the signing key privately. A different key prevents Android from updating the existing app. Git ignores generated native folders and APKs.

This project uses EAS Update at `@ceejaycabs/budget-management`, with the `preview` channel and environment. Updates must match the APK's app version. When native dependencies, permissions, plugins or native configuration change, increment `expo.version` and build a new APK. Increment `android.versionCode` for each APK update. UI code and image changes can use over-the-air updates with the same native dependencies and configuration.

The preview environment contains only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Copy them from the configured Supabase project without committing or printing their values. Keep management tokens, service-role keys and OCR provider keys out of EAS app variables. Run `scripts/configure-eas-public-env.mjs` with the installed EAS CLI file path to copy the two app settings. The script hides command output so it does not log their values.

Publish a compatible update after tests pass:

```powershell
npx.cmd eas-cli@latest update --channel preview --platform android --environment preview --input-dir dist/ota --message "Describe the change"
```

The app checks for updates when it opens. It starts with its saved code and downloads an update in the background. After the download finishes, restart the app to apply it. Install the first APK with update support over the old APK once. The old APK cannot add update support remotely.

These instructions use local Gradle builds and the original signing key. Before using EAS cloud builds, configure that same key. Do not generate a different key for an existing installation.
