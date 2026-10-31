# Expense confirmations and category keyboard dismissal

The user requested confirmation for entries over budget or without a configured value, and dismissal of the amount keyboard after choosing a category. Interpret an unset value as an unset category budget; preserve the existing separate tracked-balance confirmation.

- Use the shared new/edit expense review so manual entries, receipt reviews and restored drafts follow the same confirmation path. Income and transfers retain their flows.
- Refresh the complete owner/month/timezone report snapshot for the transaction date before deciding. Compare exact cents against the selected category budget; equality is allowed, an explicit zero is a cap, and null is unset. For edits in the same category/month, subtract the original expense before adding the replacement.
- Show budget warnings with any existing tracked-balance warning. Record anyway explicitly saves; Back to expense preserves the draft. A failed check discloses that the budget is unknown rather than assuming zero. Confirmations are advisory, not a server-enforced spending cap.
- Preserve linked-bill amount confirmation, then run the budget review before saving the confirmed settlement.
- Dismiss the keyboard before opening the category chooser, selecting a category, and closing it. Mount the sheet only while open so an invisible modal cannot capture and later restore stale amount-field focus.
- Verify exact cap/zero/unset/refund totals/edit calculations, confirmation/cancel behavior, and picker dismissal with Jest, TypeScript and lint. Check production phone-web interactions with synthetic data; native keyboard verification requires a connected phone/emulator.

No database migration or new native dependencies. OTA publication requires explicit approval for this new bundle/assets payload after verification.

Verification complete: 44 targeted tests/7 suites, TypeScript, full Expo lint, all-platform production export and configuration audit pass. Synthetic phone-web production checks pass at 390px light and 360px dark with Reduce Motion, including input blur, draft preservation, over/unset budget confirmation and explicit-save-only behavior. Native device keyboard behavior is pending; no device connected. Export: dist/entry-confirmations-verified. User explicitly approved OTA upload. Published Android preview runtime1.0.2 group609b395b-ef11-43ec-bef5-e2e51cb1fff7 / update01a19191-681b-73c5-b6b6-051903c23b1f at2026-10-31T10:46:28.123Z. Live manifest bundle and all29asset hashes match audited export; direct launch download403 prevents downloaded-byte verification here. Physical-phone delivery remains unverified. Runtime1.0.1 unchanged.
