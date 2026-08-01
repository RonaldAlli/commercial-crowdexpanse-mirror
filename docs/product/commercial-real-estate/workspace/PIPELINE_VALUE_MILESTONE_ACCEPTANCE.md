# Pipeline Value — Milestone — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Authoritative milestone-level acceptance of
> the complete Pipeline Value capability (Increments 1–2) as one product capability, against verified `main` (app
> code `c613d74`; records on `6fd13a7`). Read-only Operational Inventory over existing authority; no schema / API /
> forecasting. Review report: `PIPELINE_VALUE_MILESTONE_ACCEPTANCE_REVIEW.md`. Context: the two increment
> acceptance records, [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## Accepted milestone findings

1. **Pipeline Value is Operational Inventory, never a forecast.**
2. **The population is transparent** (Included / Excluded / Why).
3. **Total, breakdowns, and contributing-deal list reconcile** (Σ deal fees === total).
4. **Every included dollar is traceable to an Opportunity.**
5. **Realized opportunities are excluded.**
6. **Stage, channel, and campaign breakdowns use existing authority.**
7. **No weighting, probabilities, forecasting, schema, API, workflow, or backend authority introduced.**
8. **Inventory Integrity, Population Transparency, and Reconciliation Transparency preserved.**

## Accepted observations (non-blocking)

- **OB-1** — Playwright teardown warning; all 145 tests pass.
- **Lost/Dead exclusion** — not yet available (G-1 not implemented); disclosed honestly in the UI. **The
  limitation must remain visible until the Forecasting Backend program creates explicit Lost/Dead authority. No
  heuristic inference is permitted.**
- **Organization-level entry** — Pipeline Value remains discoverable through the Revenue workflow, not a new
  global-navigation item.

## Integrated verification (at acceptance)

Isolated build EXIT 0 · app `tsc` 0 · scripts `tsc` 0 · ESLint clean · unit PASS (132 files) · **Playwright
145/145** · migration delta NONE · API delta NONE · footprint 4 files / +208 lines (read-only façade).

## Governed status & next phase

**Pipeline Value = ACCEPTED WITH OBSERVATIONS.** Authorized to enter the established Accepted → Released lifecycle
(isolated builds throughout): Release Candidate → production deployment (D25) → production verification (`/revenue`
+ Pipeline Value total + breakdowns + contributing-deal list + traceability; Operational-Inventory/"not a forecast"
labeling + Lost/Dead disclosure visible; reconciliation; Realized separation; Revenue/Opportunity/Guided
Underwriting/Closing Workspace/Closing Console regressions) → release record → click-path Discoverability
Verification (Opportunity Workspace → Revenue section → Revenue Workspace → Pipeline Value → contributing
Opportunity) → formal close. On completion: **RELEASED · VERIFIED · DISCOVERABLE · FORMALLY CLOSED.**
