# CRE Operating Workspace — Pipeline Value — PRODUCTION RELEASE RECORD

> **Status: RELEASED · VERIFIED · DISCOVERABLE · FORMALLY CLOSED** — deployed to production and verified live
> 2026-08-01. Full Accepted → Released lifecycle, each stage completed in order using isolated verification builds.
> Context: `PIPELINE_VALUE_MILESTONE_ACCEPTANCE(_REVIEW).md`, the two increment acceptance records, the Pipeline
> Value business plan, [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## What was released

Pipeline Value — a read-only **Operational Inventory** on `/revenue`: the unweighted sum of
`Opportunity.assignmentFeeUsd` over the open-pipeline population (`UNDER_CONTRACT`/`BUYER_MATCHED`/`CLOSING`,
excluding realized), with breakdowns by stage / channel / campaign and a contributing-deal list where every dollar
traces to a visible Opportunity. Over existing authority only; **no schema, API, workflow, weighting, probability,
forecasting, or backend authority.** Never a forecast; kept separate from Realized Revenue.

- **Accepted baseline:** `main 5e16322` (Increments 1–2 accepted; milestone ACCEPTED WITH OBSERVATIONS).
- **Active release:** `releases/r1504889430182274-1512892`, build `S20R7pdcPPBe-Eeunv1JB`, baseline `5e16322`.
- **Superseded release:** `r1477194428329842-1185303` (Revenue Workspace Milestone 1).

## Release sequence executed (governed, in order; isolated builds)

1. **Increments merged + accepted** — PR #111 (Inc1) / #113 (Inc2), each with its acceptance record.
2. **Milestone acceptance review** (PR #115) → ACCEPT WITH OBSERVATIONS; **final acceptance record** (PR #116) →
   `main 5e16322`.
3. **Release Candidate** — isolated build EXIT 0 · app `tsc` 0 · scripts `tsc` 0 · ESLint clean · unit 132 ·
   **Playwright 145/145** · **migration delta NONE · API delta NONE** · D25 `--dry-run` OK.
4. **Production deployment** — D25 `--production --yes`: PRECHECK→BUILD→VERIFY_BUILD→SWAP→RESTART→VERIFY_RUNTIME→
   SMOKE→COMPLETE all ok. Symlink `.next → releases/r1504889430182274-1512892`.
5. **Production verification** (live, real prod data — 1 open-pipeline deal present): symlink → new release; health
   `200`; auth gating `307`; **0 new error lines**; clean startup (`✓ Ready in 732ms`). Confirmed on `/revenue`
   (HTTP 200): Pipeline Value section · **Operational inventory** + **"not a forecast"** labeling · **Lost/Dead
   disclosure visible** · By stage / By channel / By campaign · Contributing deals · Included / Excluded (Population
   Transparency). Realized Revenue remains a separate section. Regressions all `200`: `/opportunity-workspace/[id]`,
   `/guided-underwriting/[id]`, `/closing-workspace/[id]`, `/opportunities/[id]` (Console), `/dashboard`.

## Discoverability Verification (click-path, live)

Opportunity Workspace → Revenue section → **Revenue Workspace (`/revenue`)** → **Pipeline Value** → **contributing
Opportunity** — all links verified live (Opportunity Workspace "Open Revenue Workspace" → `/revenue`; Pipeline
Value contributing-deal → `/opportunity-workspace/[id]`). No new global-navigation entry (Financial Workspace
Progression · Workspace Discoverability).

## Contracts in force

Platform workspace: Executive Summary · Information Quality · Decision Chronology · Workspace Progression ·
Workspace Discoverability · Operator Entry Principle · Workflow Intent Preservation · Explicit Intent Navigation.
Financial: Financial Truthfulness · Revenue Evidence · Revenue Traceability · Active Evidence · Revenue State
Progression · Financial Workspace Progression · Financial State Authority · Forecast Integrity · Inventory
Integrity · Population Transparency · Reconciliation Transparency. Operational: Production Build Isolation.

## Observations (non-blocking, carried)

- **OB-1** — Playwright teardown warning (harness; all 145 pass).
- **Lost/Dead exclusion pending** — disclosed in the UI; **must remain visible until the Forecasting Backend
  program creates explicit Lost/Dead authority (G-1); no heuristic inference permitted.**
- **Org-level entry** — Pipeline Value reached via the Revenue workflow, not a new nav item.

## Governed status

**Pipeline Value = RELEASED · VERIFIED · DISCOVERABLE · FORMALLY CLOSED.** No release tag (consistent with prior
CRE releases). Reference: release stamp `r1504889430182274-1512892` + baseline `5e16322`. Next in the accepted
program order: the **Forecasting Backend Authority** program (G-1 Lost/Dead state, G-3 stage-probability policy,
G-4 forecast snapshot) — its own governed program on the founder's charter.
