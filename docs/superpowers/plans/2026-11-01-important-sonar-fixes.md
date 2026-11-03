# Important SonarCloud reliability and complexity fixes

User approved fixing important logic/control-flow and complexity issues after reviewing the 70 findings on PR #12. Scope prioritizes the failing reliability rule, misleading conditional/loop bodies, and the seven reported complexity findings; avoid cosmetic-only cleanup and deployed migration rewrites.

- Sort reminder coverage by parsed timestamps instead of default string ordering. Regression test uses different UTC offsets whose lexical and chronological orders differ.
- Add explicit blocks to affected conditionals and loops, preserving which operations run unconditionally. Encryption envelopes, keys, byte conversion and deployed SQL stay unchanged.
- Separate transaction rendering, receipt calculations, initial transaction type, transfer prefills, draft status and save recovery into named helpers. Invoke rendering helpers normally to preserve component identity and local input state.
- Split setup's step dispatcher into individual preference/Cash/monthly actions. Keep currency confirmation, post-save refresh recovery, account guards and progress persistence intact.
- Extract budget-review fetching, payment-method payload validation, reminder status text and chart state helpers. Split notification reconciliation and alert sending into focused helpers while preserving ownership, baselines, privacy and scheduling behavior.
- Local SonarJS cognitive-complexity (15), misleading-block and sort rules pass across affected files. Runtime/TypeScript/lint/test and remote analysis verification are recorded below after completion.

These source changes update the PR only. Previously published Android OTA remains unchanged; no schema deployment or new APK is needed for this refactor.

Verification: final 87 tests across 12 affected suites pass, including the timestamp-offset ordering regression; TypeScript, full Expo lint, whitespace and the targeted SonarJS rules pass. All-platform export `dist/sonar-important-verified` passes its 96-file public/private configuration audit. Synthetic production phone-web checks pass at 390px/light and 360px/dark for chart geometry, masked wallet edits/clearing, confirmation-only expense writes, draft retention and category focus dismissal. An unrelated browser-extension error was isolated by rerunning entry checks with extensions disabled; app checks then pass. Native phone verification remains pending. Remote SonarCloud results are tracked on PR #12.
