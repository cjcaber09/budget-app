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

Budget Tracker uses a clear mobile hierarchy across authentication, Overview, Transactions, Reports, Settings, and nested editing screens. Warm surfaces, forest actions, system type, fine separators, and aligned amounts organize existing budgeting and receipt workflows. Web is a phone-layout development preview. No desktop layout is specified.

The independent finish review returned “Ship at verified mobile web-preview scope.” Phone previews at 390x844 and 360x800 used synthetic fixtures, including dark theme and reduced-motion interactions. Production iOS and Android Hermes exports pass. Native picker presentation, safe-area behavior, keyboard and screen-reader behavior, release-build motion feel, and performance still require device verification. No generated raster ships in this redesign; existing icon assets remain unchanged.

## Colors

Use `src/styles/theme.ts` role names directly. `useColors()` selects the light or dark palette from the system color scheme. Category colors represent user data in icons, swatches, and charts; they do not replace action colors. Budget status combines text with color.

| Role | Light | Dark |
| --- | --- | --- |
| background | #F5F6F2 | #141C18 |
| surface | #FFFFFF | #1C2721 |
| surfaceAlt | #EDF0E9 | #243229 |
| text | #202B26 | #F0F3EC |
| muted | #626D65 | #AFBDB1 |
| subtle | #69736A | #9CAE9F |
| border | #DDE3DA | #35473B |
| primary | #193C32 | #BDDAC4 |
| primaryHover | #285244 | #D6E9D9 |
| onPrimary | #FFFFFF | #163022 |
| selected | #DFE9DD | #334D3C |
| success | #326449 | #A9D2B1 |
| successBg | #E6EFE7 | #253F2E |
| warning | #84591B | #E8C58C |
| warningBg | #F8EFDC | #433620 |
| danger | #A33F36 | #F1A59B |
| dangerBg | #F9EAE5 | #462B28 |
| scrim | rgba(14, 27, 20, 0.42) | rgba(0, 0, 0, 0.65) |

`primaryHover` exists in the theme; it does not imply a required mobile hover state.

## Typography

Use the platform system faces and shared `type` styles. Titles are 30/38 at 700; headings 19/26 at 600; body 15/23; labels 13/20 at 600. Authentication headings locally use 26/34. Supporting dates/privacy copy use 12px, and tab labels use 11px. Amounts use tabular numerals with sizes and weights adjusted for their context. Let category names wrap while preserving amount alignment; retain accessibility font scaling.

## Layout

Keep each screen’s ScrollView or FlatList and obtain themed styles from `usePageLayout()`. Main tab pages use an open `workspace` with 28px section gaps; focused forms use a padded `card`. Both have a 560px cap for the phone preview. Reports stack sections vertically. The sheet has a 520px cap and a 90% maximum height.

Page padding is 24px; header controls wrap with a 16px gap. Headerless tab screens request `safeTop: true`, adding the top inset. Scroll content reserves 96px plus the bottom inset. Four bottom tabs remain visible on nested editing routes. Their height is 72px plus the bottom inset, with 10px top and bottom padding plus that inset at the bottom. The FAB sits 16px above the tab bar, 24px from the right edge, and appears only on the four primary tab routes.

## Elevation & Depth

Use surface tone, spacing, and thin borders to separate information. Page cards and sections have no stacked shadows. The FAB alone uses `0px 6px 18px rgba(16, 38, 25, 0.18)` with native elevation 8. The modal scrim establishes sheet depth.

## Shapes

Fields and option chips use 8px corners; primary buttons, month controls, and icon tiles use 10px; page surfaces and sheet top corners use 16px. The FAB is circular at 56px. Budget tracks are 4px tall with 2px corners. Small category swatches are 8px circles.

## Components

- **ScreenHeading and MonthPicker:** title/description precede the month action; controls wrap to fit the phone. Month arrows each have a 48×48px target.
- **CategoryBudgetRow:** display category identity, a readable status such as “Nearing limit” or “Over budget,” spent/budgeted amounts, and a progress track clamped to 100%. A missing budget offers “Set a budget.”
- **TransactionListItem:** show category, optional one-line note, date, signed tabular amount, and edit chevron. Use a tonal icon tile and row separator.
- **SharedForms:** reuse new/edit forms without outer padding. Inputs are at least 50px high; notes at least 112px. Chips and secondary actions are at least 48px; primary buttons at least 52px. Labels precede fields; validation errors use danger text and tone.
- **AddTransactionFab and AddTransactionSheet:** preserve camera, upload, manual entry, cancellation, and provider privacy copy. Sheet options are at least 72px high. Keep sheet content scrollable and pad for the bottom safe area. iOS pickers wait for modal dismissal.
- **MotionPressable:** presses scale to 0.98 and fade to 0.88 over 120ms using `cubic-bezier(0.23, 1, 0.32, 1)`. Disabled opacity is 0.45. Reduced motion and web keyboard focus suppress scale and duration.
- **Sheet motion:** enter in 240ms and exit in 180ms, with a 32px translation and `cubic-bezier(0.32, 0.72, 0, 1)` easing. Reduced motion removes translation and sheet duration; the scrim retains its opacity timing. Navigator screens cross-fade over 180ms with ease-out cubic easing; Reduce Motion disables the transition. List rows have no entrance animation.
- **QueryState and reports:** preserve distinct loading, empty, and retryable error copy. Reports retain labeled chart legends and readable category totals; chart widths follow available phone space.

## Do's and Don'ts

Do:

- Keep the month, amounts, and next action easy to scan.
- Pair budget status colors with explicit words.
- Use shared theme, layout, and form styles.
- Preserve safe areas, font scaling, focus visibility, and 48px-or-larger control targets.
- Verify phone rendering and distinguish web-preview evidence from native-device evidence.

Don't:

- Add desktop rails or split layouts.
- Wrap every section in another shadowed card.
- Use category colors as action backgrounds.
- Add sliding navigation or list entrance motion.
- Remove OCR privacy disclosures or alter backend workflows as a styling change.
