# Budget Tracker application

Mode: Operate. Scope: all existing mobile Expo screens on iOS and Android. User selected Clear route and code-first implementation, then explicitly excluded desktop design. Web is a phone-layout preview.

## Direction contract

THESIS: Financial wayfinding on a phone: read the month, understand spending, choose the next action. Replace the undifferentiated boxed screen with a clear mobile hierarchy.

OWN-WORLD: Warm neutral surfaces, deep forest green actions, system sans typography, aligned tabular amounts, fine separators, and compact consistent controls. Category colors are data, not button backgrounds.

STORY: Choose a month, read income and expenses, inspect budget status, then log or edit a transaction. Preserve existing Supabase and OCR workflows.

FIRST VIEWPORT: Phone screen with a title, month selector, paired income and expense totals, and a compact net-income row. Budget lanes follow, with category spending further down. Four bottom tabs provide persistent navigation; the add action sits above them. There is no desktop rail or split layout.

FORM: Clear route, grounded candidate 7; seed 4dc36295. Wayfinding hierarchy without transit decoration. Press feedback is 120ms; the entry sheet uses a reversible transition with reduced motion. Tabs do not slide.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Raised disciplines

Crouwel: shared alignment. Character catalog: category identity. Emigre: numeric hierarchy. Tabbed manual: current section. Mixtape: wrapping names with aligned amounts. Exposure record: status readable without color.

## Verification limits

Edge screenshots verify the phone-layout web preview. Windows has no iOS simulator; native picker presentation, insets, release-build motion feel, and performance require real-device verification. Desktop captures made before the scope correction are obsolete.
