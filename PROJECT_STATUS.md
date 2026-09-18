# Project Status

## Stable state

- Product: Probe QA (`scenario-qa-app`), a B2B SaaS platform for automated website QA.
- Repository: `dnwndalsrl/scenario-qa-app`.
- App directory: `scenario-qa-app` (Vercel Root Directory).
- Production: https://scenario-qa-app.vercel.app
- Latest application release: `4a3b18ef1f73a6104a2b18a2769bb476c6ab50a6` (`Stack home hero sections vertically`).
- Its Vercel deployment succeeded; `/api/health` and `/login` returned HTTP 200.

## Current state

- Functional QA supports scenario generation, execution, result analysis, user review, defect registration, and Excel reports.
- UI QA supports rule-based inspection, optional design comparison, evidence screenshots, review status and notes, filters, Excel export, and defect registration.
- UI audit failures record a safe execution ID, stage, error code, and error type without storing URLs, tokens, cookies, raw errors, or stacks.
- Diagnostic stages are `browser_start`, `page_collection`, `design_comparison`, `artifact_upload`, `artifact_metadata`, `issue_storage`, and `completion_update`.
- The home hero now renders the introduction and analysis form as two full-width vertical sections; usage metrics remain horizontal.
- The latest layout change passed 4 targeted style tests and the production build. No database migration was required.

## Known issue

- The root cause of UI audit failure `706c9e31-6804-4275-95d0-48cf8fb72aa2` is still unconfirmed.
- The legacy result only contains `UI_AUDIT_RUNNER_FAILED`; new stage diagnostics are not retroactive.
- Run UI QA exactly once in production. If it fails, compare only `error.stage` and `error.errorCode` with the matching GitHub Actions run before changing timeouts, retries, code, or deployment configuration.

## Local workspace warning

- Git root: `C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs`.
- App path: `C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-qa-app`.
- Local `main` is still based on `05bf38f57c32c3103fdd635e6c8a48e366435bd0` and contains many preserved tracked and untracked changes.
- Do not pull, reset, commit, or clean this workspace until the local changes have been reconciled with production `main`.
- New team members must clone the latest GitHub `main` into a separate directory instead of copying this workspace.

## Working rules

- Start from this file and verify the current GitHub `main` before implementation or deployment.
- Diagnose without edits; implement only the requested change with targeted verification.
- Production deployment is GitHub `main` to the existing Vercel integration. Do not use direct Vercel deployment, temporary repositories, force push, or destructive Git commands.
- When using GitHub blob/tree commits, repository paths must start with `scenario-qa-app/`.
- Reuse successful checks when no relevant source, dependency, environment, or deployment configuration changed.
- Do not print credentials or unnecessarily inspect or modify production data.

## Next action

- Perform one new production UI QA run and use the new stage diagnostics to identify the actual failure point if it fails.

