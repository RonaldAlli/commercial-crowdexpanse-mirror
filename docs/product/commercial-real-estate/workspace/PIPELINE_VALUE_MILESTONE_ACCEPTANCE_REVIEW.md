# Pipeline Value — Milestone-Level Acceptance Review

> **Recommendation: ACCEPT WITH OBSERVATIONS.** Milestone-level review of Pipeline Value (Increments 1–2, both
> accepted) as one product capability, against verified `main` (app code `c613d74`; records on `49da589`). This
> review verifies the capability **before** the release lifecycle; it does not itself authorize a Release
> Candidate, deployment, or a final acceptance record. Context: the two increment acceptance records,
> `PIPELINE_VALUE_BUSINESS_PLAN(_ACCEPTANCE).md`, [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## The milestone as one capability

A read-only **Operational Inventory** on `/revenue` answering **"What is the total contractual value currently in
our active pipeline?"** — the unweighted sum of `Opportunity.assignmentFeeUsd` over the open-pipeline population
(`UNDER_CONTRACT`/`BUYER_MATCHED`/`CLOSING`, excluding realized), with breakdowns by stage / channel / campaign and
a contributing-deal list where every dollar traces to a visible Opportunity. It is **never** a forecast and is kept
separate from Realized Revenue.

## Integrated verification (verified `main`, isolated build path)

Isolated production build EXIT 0 · app `tsc` 0 · scripts `tsc` 0 · ESLint clean · unit **PASS (132 files)** · full
**Playwright 145/145** (Pipeline Value Inc 1–2 + Revenue M1 + the whole prior CRE suite; tenant / authz /
responsive / a11y; OB-1 teardown non-blocking). **Migration delta NONE · API delta NONE.** Footprint vs the last
release (`709c318`) = 4 files, +208 lines — a read-only façade over existing authority (`Opportunity.assignmentFeeUsd`,
`OpportunityStage`, `acquisitionChannel`/`acquisitionCampaign`, assignment status). **No schema, API, workflow,
weighting, probability, forecasting, or backend authority added.**

## Product criteria (proven)

1. **Operational Inventory, not a forecast** — unweighted Σ Expected over the open pipeline; labeled Operational
   Inventory; separate from Realized. ✅
2. **Inventory Integrity** — total, breakdowns, and the contributing-deal list all derive from one authoritative
   population; Σ deal fees === total (unit-tested). ✅
3. **Reconciliation Transparency** — every reported dollar reconciles to a visible contributing deal. ✅
4. **Population Transparency** — explicit Included / Excluded / Why; the Lost/Dead limitation (G-1) is disclosed,
   never inferred. ✅
5. **Revenue Evidence + Revenue Traceability** — each contributing deal links to its Opportunity Workspace. ✅
6. **Financial State Authority** — owned by Revenue; derives explicitly from Expected (`assignmentFeeUsd`). ✅
7. **Financial Truthfulness · Information Quality** — "Fee not set" for $0; honest empty states. ✅
8. **Accessibility + responsive** — no horizontal overflow at mobile (incl. the latent Revenue-M1 realized-deals
   table, corrected here). ✅

## Standing contracts (in force)

Platform workspace: Executive Summary · Information Quality · Decision Chronology · Workspace Progression ·
Workspace Discoverability · Operator Entry Principle · Workflow Intent Preservation · Explicit Intent Navigation.
Financial: Financial Truthfulness · Revenue Evidence · Revenue Traceability · Active Evidence · Revenue State
Progression · Financial Workspace Progression · Financial State Authority · Forecast Integrity · Inventory
Integrity · Population Transparency · **Reconciliation Transparency**. Operational: Production Build Isolation.

## Observations (non-blocking)

- **OB-1** — Playwright teardown warning (harness; all 145 pass).
- **Lost/Dead exclusion pending (PV-1 / G-1)** — Pipeline Value cannot yet exclude cold/lost deals because that
  business state does not exist; explicitly disclosed in the UI. It tightens automatically when G-1 is built (the
  Forecasting Backend program) — no conceptual change.
- **Org-level discoverability** — Pipeline Value lives on `/revenue`, reached via the workflow (no new top-nav),
  consistent with Revenue M1.

## Recommendation

**ACCEPT WITH OBSERVATIONS.** Pipeline Value satisfies its objective, preserves every authority boundary and
standing contract, and is release-ready. On acceptance, proceed to the established Accepted → Released lifecycle
(isolated builds): Release Candidate → production deployment → production verification (Pipeline Value total +
breakdowns + contributing-deal list + traceability on `/revenue`; Operational-Inventory vs Realized separation;
Revenue / Opportunity / Guided Underwriting / Closing regressions) → release record → click-path Discoverability
Verification → formal close.
