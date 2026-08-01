# Pipeline Value — Business Plan — Acceptance Record

> **Status: PLANNING ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts
> `PIPELINE_VALUE_BUSINESS_PLAN.md` (PR #109, merged to `main` `559b1b3`). **Increment 1 only** is authorized (see
> below). Context: [[crowdexpanse-cre-workspace]], `REVENUE_FORECASTING_MODEL_BUSINESS_SPECIFICATION_ACCEPTANCE.md`.

## Rulings

- **PV-1 — Option A APPROVED.** Ship Pipeline Value using existing active authority, with an **explicit note**:
  *"Pipeline Value currently represents all deals in the active contractual pipeline and does not yet exclude
  Lost/Dead opportunities, because that business state does not yet exist."* **Do NOT create temporary heuristics
  to infer Lost/Dead.** When G-1 (the Lost/Dead state) is implemented later, the population tightens automatically
  without changing the conceptual model. Aligns with Information Quality · Financial Truthfulness · Active Evidence.
- **Value source:** `Opportunity.assignmentFeeUsd` (contractual expected revenue) — not purchase price, contract
  value, projected economics, or realized revenue.
- **Population:** `OpportunityStage ∈ { UNDER_CONTRACT, BUYER_MATCHED, CLOSING }`, excluding `PAID` (and executed
  assignments = realized); Lost/Dead exclusion deferred until G-1, documented in the UI.
- **Breakdowns:** stage · channel · campaign — all existing active authority.
- **Placement:** inside the existing Revenue Workspace (`/revenue`); no new workspace, no new top-level nav.
- **Opportunity traceability preserved** (Revenue Evidence · Revenue Traceability).

## New platform contract — Inventory Integrity

**Pipeline Value must always equal the visible contributing population.** No hidden rows, no hidden filters — every
dollar in the total is traceable to a displayed Opportunity. If a deal leaves the inventory, the reason must be
explicit (Realized, Lost, Dead). This gives operators confidence that the inventory matches the total. Complements
Financial Truthfulness · Revenue Evidence · Revenue Traceability · Active Evidence · Revenue State Progression ·
Financial Workspace Progression · Financial State Authority · Forecast Integrity.

## Recorded

Pipeline Value confirmed as Operational Inventory · Option A approved · Lost/Dead exclusion deferred until G-1 ·
existing authority only · stage/channel/campaign breakdowns approved · Opportunity traceability preserved ·
Inventory Integrity added as a platform contract.

## Authorization

**Increment 1 — APPROVED TO IMPLEMENT:** organization-level Pipeline Value summary — total using
`Opportunity.assignmentFeeUsd`, breakdown by stage / acquisition channel / acquisition campaign, and the explicit
Lost/Dead disclosure. Preserve Financial Truthfulness · Financial State Authority · Revenue Evidence · Revenue
Traceability · Inventory Integrity. No forecasting / weighting / probabilities / new backend / schema / API /
Lost-Dead inference. **Stop after Increment 1 for review before any merge or release activity.**
