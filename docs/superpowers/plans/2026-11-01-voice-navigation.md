# Raised navigation and voice entry

Final navigation supersedes the initial moving raised-tab design: a bottom-flush four-tab bar with a fixed center + and transparent U cutout, stationary labels/icons, a translucent liquid active highlight settling by 340 ms, and 160 ms fades with Reduce Motion. The + shadow is centered. Other delivered scope: Manual/Scan/Upload/Voice entry grid; Android voice recording and proposal review; scoped native-handoff lock protection; private server-side voice admission limits.

## Lifecycle and privacy

Camera, photo-library/avatar pickers and microphone permission requests use a two-minute, owner/operation-scoped guard. Only an already unlocked foreground app can acquire it. Financial content remains obscured while away, without presenting an interactive unlock modal over a system picker. Callback/foreground ordering is supported. Expiry requires unlock; explicit locking, sign-out and financial reset invalidate the guard. AppState cannot distinguish Home while the external picker is open; this is the accepted bounded exemption. Voice recording and network processing never extend it.

An encrypted owner/purpose/visit/time marker supports Android activity recreation through ImagePicker.getPendingResultAsync after authentication. Recovery expires after 15 minutes and requires an explicit Resume action. No unlock exemption survives restart. Account/reset generations reject late media and voice results.

Voice supports one new English/Tagalog/Taglish income or expense per clip (20 seconds). Audio is temporary; transcripts remain memory-only. Only reviewed fields use existing encrypted drafts. Existing unfinished/pending-save drafts are resolved before recording. Unclear direction/category stays unresolved; ambiguous payment/source review requirements survive draft recovery. Transfers, corrections and independent multiple-entry speech are rejected as ordinary entries. Version-2 itemized purchase support supersedes the original purchase-list restriction; see 2026-11-01-voice-purchases.md. Existing exact saves and budget/balance confirmations remain authoritative.

## Backend

Migration 0038 adds service-only, RLS-protected content-free request receipts and provider cooldown state. Atomic advisory-lock admission enforces 10 seconds / 5 per rolling hour / 20 per rolling day per owner; 2 per rolling minute / 40 per rolling day / 900 per Pacific calendar month globally; one live request per owner and two globally. Count admitted attempts, including failures. Request UUID + payload fingerprint deduplicate within 90 days; 60-second concurrency lease expiry never authorizes replay. Auth deletion anonymizes global usage instead of resetting it. Financial reset epoch changes invalidate completion.

The authenticated voice-entry Edge Function uses the existing GEMINI_API_KEY and default gemini-3.5-flash-lite (VOICE_GEMINI_MODEL override). VOICE_ENABLED=true enables it; set false to disable Voice without touching OCR. Limits: 3 MiB request before JSON parse, 2 MiB decoded M4A, 32 KiB choice context, 64 KiB provider response, 20-second provider timeout and 2,048 output tokens. No automatic provider retries; 429 responses carry retry timing. The backend returns proposals only, never financial writes. Independent application counters do not guarantee free Google usage or reserve shared provider capacity for OCR.

## Validation and delivery

- TypeScript, Expo lint, Deno check, Jest, hosted rollback SQL and hosted concurrent-admission scripts.
- scripts/voice-entry-live-test.mjs accepts VOICE_TEST_AUDIO: a fictional M4A describing an expense of twenty PHP in Food. It creates/deletes a synthetic owner, retains its anonymized quota receipt, checks auth/deduplication, makes one provider call and asserts no financial transaction was written.
- scripts/deploy-voice-entry.mjs is dry-run by default; --apply deploys migration/function and enables Voice after configured-project validation.
- Phone-web verification uses synthetic fixtures at 320/360/390 px, both themes, actual tab/grid interactions and screenshots.
- Android version 1.0.3/code 7 adds expo-audio and retains package/signing identity. Existing 1.0.2 OTA runtime remains separate. Physical-device microphone, camera/picker transitions, accessibility and performance must be reported separately from web/Jest evidence.

Expo SDK 57 prebuild defaults to clearing native folders. Use `npx expo prebuild --platform android --no-clean --no-install` for incremental native configuration. The image-picker microphonePermission=false option blocks Android RECORD_AUDIO globally; it must allow the voice permission description alongside expo-audio, even though receipt camera capture remains image-only.
