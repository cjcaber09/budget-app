# Project cleanup checklist

Audited: **2026-10-16**. Sizes are approximate snapshots and will change after builds. Source audit used revision `b0382a0` plus the local Reports and receipt-item changes. This document tracks candidates; creating it does not delete anything.

## Generated files and caches

Stop builds, preview servers and any browser using the temporary profiles before removing their files. Delete only the listed directories, keeping their source/configuration siblings.

| Done | Path | Approximate size | Impact and recovery |
| --- | --- | ---: | --- |
| [ ] | `android/app/build/` | 1,314 MiB | Android build output. Recreated by the next native build. |
| [ ] | `android/app/.cxx/` | 161 MiB | Native compilation intermediates. Recreated by the next native build. |
| [ ] | `android/.gradle/` | 41 MiB | Project Gradle cache. Recreated by Gradle. |
| [ ] | `android/build/` | <1 MiB | Generated Android build output. |
| [ ] | `dist/` | 585 MiB | Previous exports and APKs. Retain installers or rollback artifacts you still want before clearing it. Local cleanup does not remove a published OTA from Expo. |
| [ ] | `.impeccable/review/` | 629 MiB | Screenshots and temporary browser profiles. Archive any evidence worth retaining first. |
| [ ] | `.impeccable/build/` | 65 MiB | Generated verification builds. |
| [ ] | `.impeccable/native-build/` | 79 MiB | Local verification/build artifacts. Review contents before deletion; preserve any signing material added since this audit. |
| [ ] | `.impeccable/allowance-export*/` and `.impeccable/payment-export*/` | 87 MiB combined | Previous verification exports. |
| [ ] | `.expo/` | 8 MiB | Expo cache and generated types. Restart Expo and visit affected routes to regenerate typed routes before relying on TypeScript checks. |

These candidates total roughly **3 GiB**, depending on which installers and verification evidence you retain.

## Temporary QA files

Most `.impeccable/` contents are local tooling or verification evidence, but the whole directory is **not** disposable.

- [ ] Review old `*-tests.json`, `*-full*.json`, logs, capture scripts and inspection scripts individually.
- [ ] Archive useful release manifests, source fingerprints and verification results before removing them.
- [ ] Keep or move reusable browser fixtures, export audits and publication checks into maintained tooling before removing their local copies. Some helpers import other files from this directory.
- [ ] Preserve the tracked files `.impeccable/config.json`, `.impeccable/design.json` and `.impeccable/surfaces/budget-tracker.md`.

Avoid a blanket deletion of JSON files: this directory also contains design configuration and reusable fixtures.

## Unused source candidates

The import audit started from all application routes and followed local imports, including native module variants. These two components had no application or test imports; text search confirmed only their definitions and documentation references.

- [ ] Remove [CategoryBudgetRow.tsx](../src/components/CategoryBudgetRow.tsx) after rechecking references.
- [ ] Remove [CategoryProgressBar.tsx](../src/components/CategoryProgressBar.tsx) after rechecking references.
- [ ] Remove the starter [reset-project.js](../scripts/reset-project.js) if no longer wanted, together with the `reset-project` command in [package.json](../package.json). Do not run this script as cleanup: it recreates the application structure.

After source removal, run TypeScript and lint, then affected tests. Verify the running Reports/Overview screens if their imports or layout change. Update current guidance that names removed components; historical plans may retain their original descriptions.

## Review before deciding

- [ ] [src/domain/recurring.ts](../src/domain/recurring.ts) is referenced by [its test](../__tests__/domain/recurring.test.ts), but was not reachable from application routes. Current recurring scheduling is authoritative in SQL. Decide whether to retain these legacy calculations as reference coverage or remove the module and its test together.
- [ ] [PORTFOLIO.md](../PORTFOLIO.md) is optional documentation. Keep it if you use the project as a portfolio example.
- [ ] `.tools/` contains local preflight/audit helpers. It is small; keep useful checks or move them into maintained scripts rather than deleting for space.
- [ ] `node_modules/` is approximately **4.8 GiB** and rebuildable with `npm.cmd ci`, but is needed for local development, tests and exports. Remove only when a reinstall is acceptable.

## Preserve

- **`android/app/debug.keystore`**: the audited local `android/app/build.gradle` configuration uses `signingConfigs.debug` for release builds. Preserve this key and its private backup so future APKs can update the existing installation. Do not delete the entire `android/` directory as cleanup.
- `.env`, `.env.example`, `app.json`, `eas.json`, `package.json`, `package-lock.json`, `plugins/` and project configuration.
- Application source, active assets, `supabase/migrations/`, Edge Functions and email templates.
- Tests, `test-utils/` and maintained deployment/SQL/live verification scripts in `scripts/`.
- `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `README.md`, this checklist and relevant specs/plans.
- `FINANCIAL-DOMAIN-AGENT.md` and the existing `.superpowers/sdd/progress.md` build history.
- Current uncommitted changes and untracked source/tests. **Untracked does not mean unused.**

## Cleanup record

| Date | Paths removed or archived | Backup/archive location, if needed | Verification | Notes |
| --- | --- | --- | --- | --- |
| — | Nothing removed by this audit | — | Read-only inventory and import/reference checks | Checklist created for future cleanup. |
