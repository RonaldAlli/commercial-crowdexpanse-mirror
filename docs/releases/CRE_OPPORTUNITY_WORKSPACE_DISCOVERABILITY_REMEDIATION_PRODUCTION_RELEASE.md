# CRE Operating Workspace — Opportunity Workspace Discoverability Remediation — PRODUCTION RELEASE RECORD

> **Status: RELEASED, VERIFIED (real click-path), CORRECTED, AND FORMALLY CLOSED** — deployed to production and
> verified live 2026-07-31. Full Accepted → Released lifecycle, each stage completed in order using isolated
> verification builds. Context: the Increment 1–3 acceptance records,
> `UI_OPPORTUNITY_WORKSPACE_DISCOVERABILITY_MILESTONE_ACCEPTANCE_REVIEW.md`,
> `UI_OPPORTUNITY_WORKSPACE_DISCOVERABILITY_REMEDIATION_PLAN.md`, [[crowdexpanse-cre-workspace]].

## What was released

The Discoverability Remediation (Increments 1–3): the dominant deal-opening paths now land on the **Opportunity
Workspace** (the single primary landing page), while execution paths remain directed to the **Closing Console**.
Pure navigation `href` repointing plus one workspace affordance — no schema, API, workflow, business-logic, or
Closing Console page changes.

- **Accepted baseline:** `main 7cfed12` (Increments 1–3 accepted; milestone review = ACCEPT).
- **Active release:** `releases/r1418337232344636-542036`, build `0BEdP30YlHAWoifoSpQMf`, baseline `7cfed12`.
- **Superseded release:** `r1410644903405812-409890`.

## Release sequence executed (governed, in order; isolated builds throughout)

1. **Increments merged** — PR #83 (Inc1) → #85 (Inc2) → #87 (Inc3), each accepted with its acceptance record.
2. **Milestone acceptance review** — recommendation ACCEPT; integrated verification all green.
3. **Release Candidate** — on `main 7cfed12`: isolated build EXIT 0 · app `tsc` 0 · scripts `tsc` 0 · ESLint clean ·
   unit 130 · **Playwright 123/123** · **migration delta NONE · API delta NONE** · D25 `--dry-run` OK. Source delta
   vs last release (`eb6baf2`) = 10 files, +21/−12 (navigation repoints + 1 affordance).
4. **Production deployment** — D25 `--production --yes`: PRECHECK→BUILD→VERIFY_BUILD→SWAP→RESTART→VERIFY_RUNTIME→
   SMOKE→COMPLETE all ok. Symlink `.next → releases/r1418337232344636-542036`.
5. **Production verification** (live, real prod data, read-only session): symlink → new release; pm2 online; health
   `200`; auth gating `307`; routes all `200` (`/dashboard`, `/opportunities` list+board, `/matches`, `/tasks`,
   `/command-center`, `/closing`, `/opportunity-workspace/[id]`); **0 new error lines** during smoke; clean startup
   (`✓ Ready in 915ms`).

## Re-run click-path Discoverability Verification (the correction, proven live)

Confirmed on the running production release by following real links (not direct URLs):

- **Pipeline → Opportunity Workspace** — list 20 / board 27 `/opportunity-workspace/` links ✅
- **Opportunity Workspace → Guided Underwriting** — exit present ✅
- **Opportunity Workspace → Closing Workspace** — exit present ✅
- **Opportunity Workspace → Closing Console** — "Open Closing Console" exit present ✅
- **Closing Dashboard → Closing Console** — console link present, **0** workspace links (C3 intentionally kept) ✅

## Release-record correction (as directed)

Prior CRE release records stated discoverability was verified when only **workspace-to-workspace** continuity had
been proven; the **dominant Pipeline/search/closing-dashboard click-paths** routed to the legacy Closing Console,
bypassing the workspace layer. **This remediation closes that gap, and discoverability is now verified along the
real operator click-path** (above). The correction is recorded here and in the milestone review; future
discoverability verification must exercise the click-path, never direct URLs.

## Contracts (in force)

Platform: Executive Summary · Information Quality · Decision Chronology · Workspace Progression · Workspace
Discoverability · **Operator Entry Principle · Workflow Intent Preservation · Explicit Intent Navigation**.
Closing-specific: Closing Confidence · Operational Accountability · Historical Integrity. Operational: **Production
Build Isolation**. The Closing Console remains the authoritative execution surface.

## Observations (non-blocking)

- **OB-1** — Playwright global-teardown warning (harness maintenance; all 123 tests pass).
- Increment-1 production incident (stray `next build` into the live-release symlink) was detected and fully
  recovered before that increment's review; Production Build Isolation was adopted and honored for the rest of the
  program.

## Governed status

**Opportunity Workspace Discoverability Remediation = RELEASED, VERIFIED (click-path), CORRECTED, AND FORMALLY
CLOSED.** No release tag (consistent with prior CRE releases). Reference: release stamp
`r1418337232344636-542036` + baseline `7cfed12`.
