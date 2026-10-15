# Form, budget and account gesture fixes

User-approved implementation scope, October 16, 2026. This corrects the reported Android keyboard/caret issues, transfer autocomplete creation freeze, and unreliable account cycling.

## Behavior

- Shared input sheets constrain their body to the usable viewport. Android clamps against the keyboard's screen position and the already-resized window, applying clearance once. iOS uses keyboard avoidance padding. Focused fields scroll clear of fixed actions; listeners and pending scroll work stop when hidden or leaving the route. Existing picker, safe-area, draft and busy guards remain.
- Money fields show plain, exact digits while focused and grouping after blur. Native inputs own the caret. Focus and blur never change the parent amount or submit it. Decimal drafts, negative/incomplete values, comma paste, external clearing and formatted read-only values remain supported.
- Monthly budget Edit replaces the displayed amount at its current position with a large currency-prefixed input. It prefills the saved/inherited allowance, keeps unset amounts blank, and places Save/Cancel below it. Pending writes freeze all controls. Owner/month-scoped drafts survive refresh loading/errors; category allocations remain the minimum allowed budget. Confirmed saves with failed refresh offer a read-only retry and hide dependent totals until fresh data is available. Stale callbacks cannot affect another editor.
- Transfer From/To use explicit closed/search/create states. Blur only closes search. Creation uses the existing native sheet host in Settings/transfer dialogs and a single standalone sheet in Add Transaction. The transfer remains mounted. Only the originating account field receives the created ID. Temporary labels never supply computed balances. Lost responses retain the exact method UUID/payload for retry; confirmed creation retries refreshing rather than writing again. Cancel restores usable fields without losing the transfer draft.
- Account cards use downward swipes only. Down advances Cash, then name/ID order, wrapping at the end. A gesture needs 48px distance, or at least 12px plus 650px/s downward velocity. Up/horizontal gestures fail early. Directional web touch-action preserves upward finger scrolling; unsupported browsers retain normal scrolling and buttons. Next animates down, Previous up. Locking lasts through the React selection commit; identity changes cancel stale completions. Buttons, arrow keys, accessibility actions and Reduce Motion remain.

## Verification

Use targeted Jest regression tests, TypeScript and lint, synthetic phone-sized light/dark web interactions and production web/iOS/Android exports. Check actual native keyboard and touch behavior if a device is connected; web and Hermes exports cannot establish native keyboard, safe-area or gesture feel.

No database migration, native dependency or Android configuration change is required. Runtime remains 1.0.1. Publication is a separate action.

## Implementation and evidence

Implemented with `KeyboardSheet`/`KeyboardViewport`, focused-field scrolling, raw focused `MoneyInput`, persistent owner/month budget editing, explicit transfer account UI states and an independent creation layer, and downward-only card gestures. The creation RPC contract is unchanged; local choice metadata contains no computed balance. Cancelled gestures and gestures that begin during a transition cannot advance selection. React commit releases the transition lock, and account identity changes invalidate old animation callbacks.

The full suite passed 557 tests in 105 suites. A subsequent month-revisit recovery fix passed all nine Overview tests, including the new regression; the final TypeScript and uncached full lint checks passed. The final affected forms/gestures run also passed 57 tests in eight suites. Budget retry can now clear a saved month's refresh guard after its editor has been unmounted by month navigation, without repeating the write.

Final synthetic browser verification also passed that month-revisit recovery path against the rebuilt production export. It restored guidance with one allowance write followed only by reads.

Production web, Android Hermes and iOS Hermes exports passed in `dist/form-fixes-final`. Export audit checked all 96 files for configured public settings and private-value exclusion. Synthetic browser checks passed light390/dark360: real downward Cash/GCash/PNB cycling, upward page scroll, short-drag cancellation, middle-of-amount caret edits, blur formatting, budget save/failed-refresh/read-only retry, lost-response same-UUID method retry, correct From selection, usable To after cancel, transfer draft preservation, one modal in Settings and a reachable focused input at 520px viewport height. Reduced Motion passed real card gestures in both themes. Current captures were inspected. Runtime checks caught and fixed the RN Web focus API mismatch; gesture regression checking caught and fixed cancelled-pan completion.

No Android device was connected when checked with ADB. Native keyboard, safe-area, screen-reader and gesture feel remain unverified. No hosted migration, financial data write, OTA publication, APK build, commit or push was performed for these fixes.
