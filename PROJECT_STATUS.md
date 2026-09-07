# Project Status

## Stable state

- Product: Probe QA (`scenario-qa-app`)
- Stable commit: `a044680` (`main`)
- Production: https://scenario-qa-app.vercel.app

## Current state

- UI QA supports URL and viewport registration, rule-based Playwright inspection, six scroll-state screenshots, and optional design comparison.
- UI audit results group findings by remediation unit, prioritize high-severity work, and provide severity and rule filters.
- Each remediation unit explains the cause, recommended fix, verification standard, affected elements, states, selectors, and measurements.
- The latest production release passed typecheck, the full test suite, the production build, and the read-only production regression.
- The standard deployment script supports a safe `-PreflightOnly` path and validates `/api/health` and `/login` after a push.
- Windows PowerShell 5.1 and PowerShell 7 syntax are checked by GitHub Actions when the deployment script changes.
- UI QA remediation groups can be reviewed as unreviewed, fix required, false positive, or deferred with an optional saved note and status filter.

## Working rules

- Start from this file instead of replaying old conversation history.
- Diagnose without edits; implement with targeted tests; deploy only when explicitly requested.
- Keep this file short and replace stale entries after material work.

## Next action

- Apply the UI audit review migration, then deploy the reviewed UI QA result workflow after approval.
