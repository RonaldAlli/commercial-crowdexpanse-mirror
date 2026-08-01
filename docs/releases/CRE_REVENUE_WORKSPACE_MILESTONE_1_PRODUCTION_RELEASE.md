# CRE Operating Workspace — Revenue Workspace Milestone 1 (Realized Revenue) — PRODUCTION RELEASE RECORD

> **Status: RELEASED · VERIFIED · DISCOVERABLE · FORMALLY CLOSED** — deployed to production and verified live
> 2026-08-01. Full Accepted → Released lifecycle, each stage completed in order using isolated verification builds.
> Context: `UI_REVENUE_WORKSPACE_MILESTONE_1_ACCEPTANCE.md`, the four increment acceptance records, the backend
> audit (+ correction), [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## What was released

The Revenue Workspace Milestone 1 (Realized Revenue) — a read-only façade answering **"What revenue has actually
been earned?"**: org-level `/revenue` (Revenue Health + realized by channel/campaign + realized-revenue deal list)
and a per-deal Revenue section in the Opportunity Workspace (Projected/Expected/Realized + evidence-based Revenue
Timeline). Over existing authority only (business-intelligence realized-revenue queries, `AssignmentRecord`,
`Opportunity`, `ActivityLog`, underwriting existence); **no schema, API, workflow, accounting, forecasting,
settlement, or partner authority**; the dormant pipeline layer is not imported.

- **Accepted baseline:** `main 709c318` (Increments 1–4 accepted; milestone ACCEPTED WITH OBSERVATIONS).
- **Active release:** `releases/r1477194428329842-1185303`, build `suK6BsP_Qk5FfUm0Jjjvl`, baseline `709c318`.
- **Superseded release:** `r1418337232344636-542036` (Discoverability Remediation).

## Release sequence executed (governed, in order; isolated builds throughout)

1. **Increments merged + accepted** — PR #93/#95/#98/#100 (Inc 1–4), each with its acceptance record.
2. **Milestone acceptance review** (PR #102) → ACCEPT WITH OBSERVATIONS; **final acceptance record** (PR #103) →
   `main 709c318`.
3. **Release Candidate** — isolated build EXIT 0 · app `tsc` 0 · scripts `tsc` 0 · ESLint clean · unit 131 ·
   **Playwright 139/139** · **migration delta NONE · API delta NONE** · D25 `--dry-run` OK. Footprint 9 files /
   +475 lines (read-only façade).
4. **Production deployment** — D25 `--production --yes`: PRECHECK→BUILD→VERIFY_BUILD→SWAP→RESTART→VERIFY_RUNTIME→
   SMOKE→COMPLETE all ok. Symlink `.next → releases/r1477194428329842-1185303`.
5. **Production verification** (live, real prod data, read-only session): symlink → new release; pm2 online; health
   `200`; auth gating `307`; **0 new error lines** during smoke; clean startup (`✓ Ready in 822ms`). Confirmed
   present/`200`:
   - `/revenue` — Revenue Health, Realized/Expected/Projected, Realized revenue by channel, Realized revenue —
     deals ✅
   - Opportunity → **Revenue section** (per-deal) with the Projected/Expected/Realized tiers + **Revenue Timeline** ✅
   - Opportunity → **Revenue Workspace** ("Open Revenue Workspace" → `/revenue`) ✅
   - **Revenue Workspace → Opportunity traceability** — deal-list rows link to `/opportunity-workspace/[id]`;
     per-deal Realized tier → Closing Workspace assignment evidence (deal list is honestly empty until an
     assignment is executed in prod) ✅
   - **Projected / Expected / Realized separation** intact ✅
   - Regressions all `200`: `/opportunity-workspace/[id]`, `/guided-underwriting/[id]`, `/closing-workspace/[id]`,
     `/opportunities/[id]` (Closing Console), `/dashboard`, `/command-center`, `/closing` ✅

## Discoverability Verification (click-path, live)

- **Opportunity → Revenue section → Revenue Workspace** — the per-deal Revenue section's "Open Revenue Workspace"
  links to `/revenue` (verified live). ✅
- **Revenue Workspace is an intentional branch, not a competing entry** — no `/revenue` entry in the global nav
  (Workspace Discoverability / Financial Workspace Progression). ✅
- Existing branches (Guided Underwriting / Closing Workspace / Closing Console) preserved. ✅

## Contracts in force

Platform: Executive Summary · Information Quality · Decision Chronology · Workspace Progression · Workspace
Discoverability · Operator Entry Principle · Workflow Intent Preservation · Explicit Intent Navigation. Financial:
Financial Truthfulness · Revenue Evidence · Revenue Traceability · Active Evidence · Revenue State Progression ·
Financial Workspace Progression. Operational: Production Build Isolation.

## Observations (non-blocking, carried)

- **OB-1** — Playwright teardown warning (harness; all 139 pass).
- **Settlement timeline pending** — settlement is not yet active production authority (dormant pipeline only);
  *pending* is the truthful Active-Evidence representation until settlement becomes active authority.
- **Org-level discoverability** — `/revenue` reached via the Opportunity Workspace by design; a direct entry (e.g.
  from the Command Center Revenue tile) is a future consideration.

## Governed status

**Revenue Workspace — Milestone 1 = RELEASED · VERIFIED · DISCOVERABLE · FORMALLY CLOSED.** No release tag
(consistent with prior CRE releases). Reference: release stamp `r1477194428329842-1185303` + baseline `709c318`.
Deferred as future backend programs: forecasting / expected-revenue aggregation, accounting, partner
distributions, settlement statements, non-assignment fee types.
