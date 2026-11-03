---
name: Budget Tracker
description: Mobile financial wayfinding with warm neutral surfaces, forest actions, and aligned amounts.
colors:
  background: '#F5F6F2'
  surface: '#FFFFFF'
  surfaceAlt: '#EDF0E9'
  text: '#202B26'
  muted: '#626D65'
  subtle: '#69736A'
  border: '#DDE3DA'
  primary: '#193C32'
  primaryHover: '#285244'
  onPrimary: '#FFFFFF'
  selected: '#DFE9DD'
  success: '#326449'
  successBg: '#E6EFE7'
  warning: '#84591B'
  warningBg: '#F8EFDC'
  danger: '#A33F36'
  dangerBg: '#F9EAE5'
  scrim: 'rgba(14, 27, 20, 0.42)'
typography:
  title:
    fontFamily: 'System, sans-serif'
    fontSize: 30px
    lineHeight: 38px
    fontWeight: 700
    letterSpacing: '-0.8px'
  heading:
    fontFamily: 'System, sans-serif'
    fontSize: 19px
    lineHeight: 26px
    fontWeight: 600
    letterSpacing: '-0.3px'
  body:
    fontFamily: 'System, sans-serif'
    fontSize: 15px
    lineHeight: 23px
  label:
    fontFamily: 'System, sans-serif'
    fontSize: 13px
    lineHeight: 20px
    fontWeight: 600
  number:
    fontFamily: 'System, sans-serif'
    fontWeight: 600
rounded:
  field: 8px
  button: 10px
  surface: 16px
  fab: 28px
spacing:
  inline: 8px
  controlGap: 16px
  pagePadding: 24px
  sectionGap: 28px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.onPrimary}'
    typography: '{typography.body}'
    rounded: '{rounded.button}'
    padding: 16px
    height: 52px
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.field}'
    padding: '12px 14px'
    height: 50px
  surface:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.surface}'
    padding: '{spacing.pagePadding}'
  fab:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.onPrimary}'
    rounded: '{rounded.fab}'
    width: 56px
    height: 56px
  month-control:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    typography: '{typography.label}'
    rounded: '{rounded.button}'
    height: 48px
---

# Design System: Budget Tracker

## Overview

Financial wayfinding on a phone: read the month, understand spending, choose the next action.

Overview begins with current Total cash and an account stack above the calendar. Payment-method cards are the deliberate vibrant exception to the neutral surface system: stable emerald, blue, violet, rose, amber and teal gradients, white text, soft shadows, bold names and diminishing header peeks. Only the front card is interactive. Current balances stay separate from the selected month's budgeting figures. The bottom Monthly highlights section uses one centered pill with a measured moving indicator and three stable-height panels: Recent, Categories and Methods. Swipes and springs respect Reduced Motion; buttons, keyboard and accessibility actions provide equivalent navigation. See the [Overview plan](docs/superpowers/plans/2026-10-16-overview-accounts-highlights.md) for financial definitions and state handling.

Budget Tracker uses a clear mobile hierarchy across authentication, Overview, Transactions, Reports, Settings, and nested editing screens. Warm surfaces, forest actions, system type, fine separators, and aligned amounts organize existing budgeting and receipt workflows. Web is a phone-layout development preview. No desktop layout is specified.

The independent finish review returned â€œShip at verified mobile web-preview scope.â€ Phone previews at 390x844 and 360x800 used synthetic fixtures, including dark theme and reduced-motion interactions. Production iOS and Android Hermes exports pass. Native picker presentation, safe-area behavior, keyboard and screen-reader behavior, release-build motion feel, and performance still require device verification. No generated raster ships in this redesign; existing icon assets remain unchanged.

## Colors

Use `src/styles/theme.ts` role names directly. `useColors()` selects the light or dark palette from the system color scheme. Category colors represent user data in icons, swatches, and charts; they do not replace action colors. Budget status combines text with color.

| Role | Light | Dark |
| --- | --- | --- |
| background | #F5F6F2 | #101413 |
| surface | #FFFFFF | #1C2421 |
| surfaceAlt | #EDF0E9 | #29352F |
| inputBackground | #FFFFFF | #101413 |
| controlBackground | #FFFFFF | #26372E |
| controlBorder | #DDE3DA | #81988B |
| text | #202B26 | #F5F8F6 |
| muted | #626D65 | #C1CEC6 |
| subtle | #69736A | #A8B9AE |
| border | #DDE3DA | #3D4D44 |
| primary | #193C32 | #6BE89A |
| primaryHover | #285244 | #91F5B9 |
| onPrimary | #FFFFFF | #092316 |
| selected | #DFE9DD | #244B34 |
| success | #326449 | #A9D2B1 |
| successBg | #E6EFE7 | #253F2E |
| warning | #84591B | #E8C58C |
| warningBg | #F8EFDC | #433620 |
| danger | #A33F36 | #F1A59B |
| dangerBg | #F9EAE5 | #462B28 |
| scrim | rgba(14, 27, 20, 0.42) | rgba(0, 0, 0, 0.65) |

`primaryHover` exists in the theme; it does not imply a required mobile hover state.

Dark mode uses the approved charcoal + vivid green direction. Primary actions use the bright accent with dark labels/icons; secondary controls use `controlBackground` and visible `controlBorder`, while inputs use the inset `inputBackground`. Decorative separators retain `border` so they do not compete with controls. Existing light palette values, financial status colors, account-card gradients and category colors remain unchanged. Keyboard-visible web button focus has a 2px accent outline with 3px offset. Normal dark text/placeholder pairs meet 4.5:1; control boundaries and focus meet 3:1, including existing pressed-opacity feedback. Disabled controls retain their separate disabled semantics.

## Typography

Use the platform system faces and shared `type` styles. Titles are 30/38 at 700; headings 19/26 at 600; body 15/23; labels 13/20 at 600. Authentication headings locally use 26/34. Supporting dates/privacy copy use 12px, and tab labels use 11px. Amounts use tabular numerals with sizes and weights adjusted for their context. Let category names wrap while preserving amount alignment; retain accessibility font scaling.

## Layout

Keep each screenâ€™s ScrollView or FlatList and obtain themed styles from `usePageLayout()`. Main tab pages use an open `workspace` with 28px section gaps; focused forms use a padded `card`. Both have a 560px cap for the phone preview. Reports stack sections vertically. The sheet has a 520px cap and a 90% maximum height.

Page padding is 24px; header controls wrap with a 16px gap. Headerless tab screens request `safeTop: true`, adding the top inset. Scroll content reserves 96px plus the bottom inset. Four bottom tabs remain visible on nested editing routes. The full-width, bottom-flush bar has 18px rounded top corners, square bottom corners, an 84px body, a 4px top margin and bottom safe-area coverage. The 56px primary-green + action and its U-shaped cutout stay fixed in the center, with an 8px cutout clearance, two tabs on each side and 16px icon top padding. The navigation overlays page content so its unfilled cutout reveals the page instead of a solid background crescent; the raised button retains its shadow. No full-width strip reserves its 28px lift. Scroll padding accounts for the bar and enlarged text. A translucent filled active circle stretches into a narrow liquid trail: its head moves over 230ms and its tail retracts by 340ms, redirecting from current positions on rapid taps. The trail bends below the center cutout behind stationary icons and labels. Reduce Motion replaces travel with 160ms fades between fixed circles. The centered + action appears only on the four primary routes. Nested routes retain the originating tab highlight.

## Elevation & Depth

Existing card containers use the shared cardElevation shadow: 0px 4px 14px rgba(16,38,25,0.10) in light mode and 0px 5px 16px rgba(0,0,0,0.28) in dark mode. Apply it to page/form cards, report/guidance sections, category tiles, Overview summary and update cards. Inputs, buttons, pills and list rows retain their existing treatment. Do not add extra card wrappers. The account stack keeps its stronger existing shadows; sheets use the modal scrim for depth.

## Shapes

Fields and option chips use 8px corners; primary buttons, month controls, and icon tiles use 10px; page surfaces and sheet top corners use 16px. The FAB is circular at 56px. Budget tracks are 4px tall with 2px corners. Small category swatches are 8px circles.

## Components

- **ScreenHeading and MonthPicker:** title/description precede the month action; controls wrap to fit the phone. Month arrows each have a 48Ã—48px target.
- **Spending share:** a responsive SVG doughnut shows the exact net-expense total in its centre and complete tappable category legend below. The graphic is absolute inside a square container to keep native height bounded. Refund and unavailable-total states retain their explanations instead of misleading percentages.
- **CategoryBudgetReport:** horizontally scrollable category tiles pair a decorative category icon with a naturally wrapping title, without reserved blank title space. Remaining (or Over by) is the primary amount, above a full-content-width square doughnut with a centered usage percentage. Cards use intrinsic height and stretch through flex growth; avoid percentage card heights in the horizontal scroller, and keep the SVG absolutely positioned within its square container. Status appears in a themed text pill. Net spent and Budget sit side by side below a divider, with labels above exact amounts. Missing budgets show a dash for Remaining; navigation and selected-month context stay intact.
- **TransactionListItem:** show category, optional one-line note, date, signed tabular amount, and edit chevron. Use a tonal icon tile and row separator.
- **SharedForms:** reuse new/edit forms without outer padding. Inputs are at least 50px high; notes at least 112px. Chips and secondary actions are at least 48px; primary buttons at least 52px. Labels precede fields; validation errors use danger text and tone.
- **AddTransactionFab and AddTransactionSheet:** preserve camera, upload, manual entry, cancellation, and provider privacy copy. The chooser is a two-column grid ordered Manual, Scan / Upload, Voice, with equal-width icon/label/description tiles, 12px gaps and intrinsic height. Voice is Android-only; offline only Manual is available. Keep sheet content scrollable and pad for the bottom safe area. iOS pickers wait for modal dismissal.
- **MotionPressable:** presses scale to 0.98 and fade to 0.88 over 120ms using `cubic-bezier(0.23, 1, 0.32, 1)`. Disabled opacity is 0.45. Reduced motion and web keyboard focus suppress scale and duration.
- **Sheet motion:** enter in 240ms and exit in 180ms, with a 32px translation and `cubic-bezier(0.32, 0.72, 0, 1)` easing. Reduced motion removes translation and sheet duration; the scrim retains its opacity timing. Navigator screens cross-fade over 180ms with ease-out cubic easing; Reduce Motion disables the transition. List rows have no entrance animation.
- **QueryState and reports:** preserve distinct loading, empty, and retryable error copy. Reports retain labeled chart legends and readable category totals; chart widths follow available phone space.

Reports includes an optional **Hide zero values** switch, off by default. The session choice is shared with report details and resets on account changes or app reload. Hide only rows whose relevant monetary amounts are all zero: keep nonzero budget allocations, refunds and comparison rows with activity in either period. Trend amount lists may omit zero rows while plotted periods and dates remain complete. Totals, percentages, exports and saved financial data use the complete snapshot. If filtering hides every row, explain how to show them again.

Receipt item lists always hide completed, valid zero-value rows and count only visible rows. Keep unfinished or review-required rows reachable, along with all nonzero rows regardless of whether they affect the total. Hiding preserves the original rows and edit targets. At the 100-row limit, offer removal of hidden zero rows so another item can be added. The Reports switch does not control receipt item visibility.

## Do's and Don'ts

Settings uses a horizontally scrollable tab strip with icons, text labels, a shared divider and an underline for selection. Categories & Bills opens by default and contains scan history. Profile, Preferences, Sources and Notifications separate the remaining controls. Logout stays in the fixed Settings header; account deletion belongs to Profile. Switching tabs preserves drafts and loaded history.

Preferences contains Privacy & security and the guided-setup launcher. Native app lock is optional, uses system authentication with a device-passcode fallback, and covers mounted content with an opaque themed screen while locked. Web explains native availability. Setup is a resumable five-step modal using shared fields and existing financial save/retry behavior; it never blocks the main app or writes money merely by opening. Native notification settings disclose last successful local sync and upcoming schedule coverage, retaining old timestamps when refresh fails.

App updates has its own Settings tab. A compact inline status beneath primary-page headings shows download progress or an update-ready action. The App updates tab uses its own status and controls. Restart is explicit and waits for current work; Later dismisses the ready banner. Update failures stay local to Settings. Respect Reduce Motion and keep banners in flow above the page content.

Month navigation covers the current financial month and earlier months. Next beyond the current month shows a dismissible toast. Over-budget banners have separate detail and dismiss actions; dismissing a banner does not change financial totals or phone notification thresholds.

Do:

- Keep the month, amounts, and next action easy to scan.
- Pair budget status colors with explicit words.
- Use shared theme, layout, and form styles.
- Preserve safe areas, font scaling, focus visibility, and 48px-or-larger control targets.
- Verify phone rendering and distinguish web-preview evidence from native-device evidence.

Money fields use plain digits while focused and grouping after blur, without changing their saved value on focus. Monthly budget Edit turns the displayed amount into the input, with a currency prefix and Save/Cancel underneath. Shared input sheets reserve keyboard clearance once and scroll focused fields into view. Nested transfer account creation reuses the current sheet. Overview account cards advance on downward swipes; upward finger movement scrolls the page, with Previous/Next controls for both directions.

Don't:

- Add desktop rails or split layouts.
- Wrap every section in another shadowed card.
- Use category colors as action backgrounds.
- Add unrelated sliding page transitions or list entrance motion; the user-requested 340ms liquid tab indicator is the sole navigation-motion exception.
- Remove OCR privacy disclosures or alter backend workflows as a styling change.

Native camera/photo pickers and microphone permission prompts use a scoped two-minute lock guard with a passive privacy cover. Voice recording itself does not bypass background locking. Voice proposes one ordinary entry for review; transcript/audio are temporary, and only Save records money. See [Voice/navigation plan](docs/superpowers/plans/2026-11-01-voice-navigation.md).

Date format is an account preference: long English month/day/year, MM/DD/YYYY, DD/MM/YYYY or ISO. Stored dates, ordering and CSV formats remain ISO; native/browser calendar controls and compact chart axes retain their platform/space-specific formatting. Full entry, bill, refund, transfer and activity dates use the shared display formatter. Privacy & security adds 28px top padding. Notification switches and test controls stay disabled until phone permission is allowed; an explicit Allow notifications action requests permission or opens phone settings. Saved switches are retained while permission is denied. Toasts dismiss after five seconds, restarting the deadline even for repeated identical messages.

Voice version 2 automatically groups up to 20 compatible purchases in one 20-second clip into an itemized expense. Shared item review shows pending totals for missing prices; generated purchase summaries stay in sync until manually edited. Different dates/accounts/currencies, mixed direction and unsupported adjustments require separate recordings or Manual Entry. Voice-origin drafts retain summary mode; deleting every purchase clears stale amounts. The centered + action uses two soft black shadows with zero horizontal and vertical offset, centered evenly around the button. Its stacking order keeps it above the bar; Android elevation is omitted to avoid an additional downward shadow.


Password inputs use a shared masked field with a 48px icon-only eye/eye-off action; accessible labels name Show/Hide and the field. Visibility resets on background, owner change, disabling and clearing. Destructive consent and saved item attributes use visible checkboxes; uncertain OCR counting retains a required explicit choice. Cleanup screens use an accessible indeterminate activity bar, reduced-motion fallback and stage labels, with no fabricated percentages. Account reset/deletion hides +, shields navigation, closes conflicting sheets and rejects late entry results until device refresh finishes. See docs/superpowers/plans/2026-11-02-controls-cleanup.md.


Transaction payment metadata uses a default-collapsed Sender & reference (optional) disclosure with a chevron and expanded accessibility state. Sender name, sender phone/account and reference inputs are explicitly optional. Payment amount remains outside the disclosure; collapsing never clears metadata or changes totals.

Related form actions share a FormActions row: secondary Previous/Cancel/Close/draft actions on the left and the primary Continue/Save action on the right. Rows use equal flexible widths, 12px gaps, centered wrapping labels and at least 52px touch targets. Button bases scale with the device font size and wrap into full-width stacked actions when the available container is too narrow. Setup deferral, archive/delete actions and uncertain-save recovery remain separate. Voice review pairs Record again and Manual Entry with equal secondary emphasis.

Saved activity shows account balances Before and After in two flexible columns beneath its entry, with account names and explicit credit-card owed/credit labels. The server reconstructs these running figures from complete account history, independent of list filters, and reconciles against current balances. Edits recalculate history; these are not immutable original snapshots. Transfers include principal and fee once. Uninitialized, future-dated and opening-balance entries show explanations without invented amounts. A failed or active refresh hides old figures and offers a local retry. Saved-entry details distinguish recorded figures from unsaved form edits.
