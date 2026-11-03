# Local security, guided setup and reminder freshness

## Local security

Settings → Preferences provides an optional native biometric app lock. Enabling/disabling requires successful system authentication; enrollment is checked before enable. Strong biometrics are requested with device-passcode fallback. The global boundary holds routes on cold start until the setting is known, fails closed on unreadable settings, and covers mounted content with an opaque modal plus accessibility/input guards after inactivity/backgrounding. Failed/cancelled authentication stays locked; background events invalidate in-flight callbacks. Biometric-prompt inactivity does not create an unlock loop. Forms stay mounted through relocking. Supported screen-capture/app-switcher protection is requested while enabled. Web does not offer biometrics. Device-level app lock does not replace Supabase authorization.

Sessions, manual/transfer drafts and cached form choices use AES-256-GCM, random12-byte nonces,16-byte authentication tags and storage-key AAD. Ciphertext stays in AsyncStorage/local storage; the native master key uses SecureStore WHEN_UNLOCKED_THIS_DEVICE_ONLY. Web uses a non-extractable IndexedDB CryptoKey and requires a secure context. This protects stored bytes, not a compromised running process/origin or unlocked device. The key does not require biometric prompts on every background Auth read.

Reads migrate legacy plaintext only after encryption succeeds; failures preserve original bytes. Per-key serialization protects later edits. Native key creation is serialized; a nonsecret installation marker prevents silent key replacement after loss. Tampering, decryption failure and copied ciphertext under another key fail closed. Draft/cache owner/generation guards and cleanup remain. Startup also encrypts existing managed draft/cache records without exposing contents; errors offer retry. Recovery OTP clients remain memory-only. No server encryption contract changes.

## Guided setup

A nonblocking Overview prompt and Settings → Preferences → Open guided setup provide five steps: currency/timezone, starting Cash, monthly allowance, optional category allocations and first transaction. Progress is owner-scoped/encrypted and clears on sign-out/reset. Continue later preserves the step and current input within the running session; only step/completion metadata persists after restart.

Existing hooks/RPCs perform every financial write. Currency changes require relabel-without-conversion confirmation. Existing Cash is never overwritten. Uncertain Cash and confirmed budget saves with failed refresh retry reads rather than repeat writes. Category caps remain server-authoritative. Opening setup never writes finances; the transaction action opens a fresh review form. Manual help stays available, with its automatic popup disabled to avoid competing guides.

Encryption timing exposed a manual-form hydration race. New drafts now freeze currency/timezone on first edit using current preferences; later preference changes cannot silently relabel them. Receipt context remains unchanged.

## Reminder freshness

Native Notifications shows the last successful phone reconciliation, future scheduled count, next/last times in the financial timezone, and sync/error state. Metadata is encrypted/owner-scoped. Failed fetch/scheduling keeps the prior successful timestamp. Permission denial/off records empty schedules after cancellation. Elapsed dates are excluded from upcoming counts. The48-reminder/30-day horizon and requirement to sync this phone remain; this is not a delivery guarantee.

## Native compatibility and recovery

Added Expo-compatible local-authentication, secure-store, crypto and screen-capture modules plus Face ID configuration. This stays the unreleased app/runtime1.0.2, Android code6; appVersion policy is unchanged. Existing1.0.1 needs a new native build. No OTA/APK/IPA publication or deployment.

Expo prebuild unexpectedly treated the ignored native project as malformed, attempted cleanup and failed on a locked report file, removing generated sources and the keystore. Restored from the installed SDK template and verified certificate SHA256 fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c against both existing APKs. Applied configuration without folder cleanup; the recovery directory is ignored. Package/version/runtime, signing configuration, SDK path, permissions and secure-store backup exclusions were checked. Android :app:compileReleaseKotlin passed. The shared template debug key remains; production signing requires a deliberate migration and is outside this task.

## Verification

AES tests use a Node crypto bridge: unique nonces, Unicode, tampering/AAD, key loss, migration failure, concurrent creation and queued edits. Lock tests cover cold-start gating, cancellation, background races, retained forms and corrupt settings. Setup tests cover confirmation, no writes on open, preserved Cash, read-only recovery and resume. Reminder tests cover successful timestamps, failed scheduling, permissions and owner isolation.

Full Jest634 tests/115 suites passed before final focused refinements; final checks are in the progress log. Synthetic light/dark phone web exercises setup, ciphertext-only storage and encrypted offline draft recovery/exact retries. No hosted writes/provider calls. Android Kotlin compilation verifies native source compatibility. Physical-phone biometrics/passcode, keychain lifecycle, preview protection, process termination, native keyboard/accessibility and reminder delivery remain unverified. Windows cannot compile iOS; Hermes export does not establish native behavior.
