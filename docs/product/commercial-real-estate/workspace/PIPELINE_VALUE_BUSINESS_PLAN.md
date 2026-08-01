# Pipeline Value — Business Plan

> **Status: PLAN — AWAITING REVIEW. No implementation, no backend, no schema, no API, no deployment.** Governed
> decision: *Pipeline Value — APPROVED TO PLAN.* Read-only façade over **existing authority only**. Baseline:
> `main 8e5b8f0`. Context: `REVENUE_FORECASTING_MODEL_BUSINESS_SPECIFICATION(_ACCEPTANCE).md`,
> `UI_REVENUE_WORKSPACE_MILESTONE_1_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## 1. What Pipeline Value is (and is not)

**Pipeline Value = the total contractual value (expected fees) currently in the active pipeline** — an
**Operational Inventory**. It is **not** a forecast (no probability, no weighting, no time-phasing), **not**
Expected Revenue per deal, and **not** Realized Revenue. It is the unweighted **sum of Expected across the open
pipeline population**. It must always be labeled **Operational Inventory** and never presented as a forecast
(Financial Truthfulness · Forecast Integrity). Owner = **Revenue** (Financial State Authority).

Operator question answered: **"What is the total contractual value currently in our active pipeline?"** — plus by
stage, by acquisition channel, by campaign, and traceable to each contributing deal.

## 2. Backend capability verification (existing authority)

| Element | Authority | State |
|---|---|---|
| Value source | `Opportunity.assignmentFeeUsd` (AS-3 single source of truth for the expected fee) | **Active** |
| Population — "executed acquisition contract" | `OpportunityStage` = `UNDER_CONTRACT` and later | **Active** |
| Population — "not yet realized" | stage ≠ `PAID` (and no `AssignmentRecord.status = EXECUTED`) | **Active** |
| Breakdown by stage | `OpportunityStage` | **Active** |
| Breakdown by channel | `Opportunity.acquisitionChannel` | **Active** |
| Breakdown by campaign | `Opportunity.acquisitionCampaign` | **Active** |
| Aggregation | a BI-layer read (same pattern as the M1 realized queries; reads existing fields, no storage) | **derivation only** |
| Per-deal traceability | link each contributing deal → its Opportunity Workspace | **Active** (reuses existing route) |

**Not the value source:** `Opportunity.contractValueUsd` (the acquisition *price* / deal size) is a different
concept and is **excluded** — Pipeline Value is our expected *fee* (Expected Revenue), per the accepted model and
decision P-2.

## 3. Active vs Dormant classification — and the one gap

- **Active (sufficient to build):** value source (`assignmentFeeUsd`), the "under-contract → pre-PAID" population,
  and the stage/channel/campaign breakdowns.
- **⚠️ Missing Authority (G-1) — explicit Lost/Dead state.** The accepted population excludes "explicit Lost/Dead,"
  but **there is no Lost/Dead stage or flag today** (the 13-stage `OpportunityStage` is a linear progression with
  no lost/abandoned state). **Therefore Pipeline Value over existing authority can honor "executed acquisition
  contract, not yet realized" but CANNOT yet exclude explicitly-lost deals.**
  - **⟶ FOUNDER DECISION PV-1.** Two truthful options: **(A, recommended)** ship Pipeline Value now with the
    stage-based active population (`UNDER_CONTRACT`/`BUYER_MATCHED`/`CLOSING`, not `PAID`/realized), **explicitly
    labeled** "does not yet exclude cold/lost deals (no Lost/Dead state exists) — Information Quality," and add the
    Lost/Dead exclusion when G-1 is built in the Forecasting Backend program; or **(B)** build G-1 first (a small
    backend addition) — which is out of scope for this *existing-authority-only* program. The plan recommends (A):
    a truthful operational inventory today, refined later, keeping this program small as intended.
- **Dormant (not used):** pipeline facts / settlement — irrelevant here.

## 4. Population definition (existing authority)

**Open pipeline = opportunities with `stage ∈ { UNDER_CONTRACT, BUYER_MATCHED, CLOSING }` and no executed
assignment** (i.e. an executed acquisition contract, not yet realized). Realized (`PAID` / executed assignment) and
pre-contract stages are excluded. **Lost/Dead exclusion is deferred to G-1 (disclosed in the UI).** Deals in the
population with no `assignmentFeeUsd` set contribute **$0** and are shown honestly as "fee not set" (Information
Quality) — never guessed.

## 5. Workflow placement

- **Organization-level `/revenue`** — Pipeline Value is a **new section on the existing Revenue Workspace**,
  visually and semantically separate from Realized Revenue (Financial Truthfulness). **No new top-level
  navigation** (Financial Workspace Progression · Workspace Discoverability). Discovered exactly as Revenue is:
  Opportunity → Revenue section → Revenue Workspace.
- **Per-deal relationship** — each contributing deal traces to its **Opportunity Workspace** (Revenue Evidence +
  Revenue Traceability). Pipeline Value never becomes an isolated number.

## 6. Proposed milestone objective

Deliver a read-only **Pipeline Value** operational inventory on `/revenue`: the org total plus breakdowns by stage,
channel, and campaign, and a contributing-deal list traceable to each Opportunity — over existing authority only,
permanently labeled Operational Inventory and kept separate from Realized Revenue.

## 7. Increment breakdown (small; each reviewed + accepted before the next; isolated builds)

- **Increment 1 — Pipeline Value summary.** A new BI read (`pipelineValue*`, reads `assignmentFeeUsd` over the §4
  population; org total + by stage + by channel + by campaign) and a Pipeline Value section on `/revenue`, labeled
  **Operational Inventory**, separate from Realized, with the honest Lost/Dead disclosure (PV-1).
- **Increment 2 — Contributing-deal list + traceability + integration.** Per-deal rows (deal, stage, channel,
  expected fee) each linking to the Opportunity Workspace (Revenue Evidence/Traceability); honest "fee not set" and
  empty states; accessibility, responsive, and workflow-continuity verification; click-path discoverability.

*(Two increments reflect the "small" scope; no per-deal Opportunity-Workspace section is added — Pipeline Value is
an org-level inventory, distinct from the per-deal Revenue section shipped in M1.)*

## 8. Acceptance criteria

1. Pipeline Value = Σ `assignmentFeeUsd` over the §4 population (unweighted; no probability/weighting).
2. Breakdowns by stage / channel / campaign are correct and derived from the same population.
3. Always labeled **Operational Inventory**; never described or presented as a forecast; visually separate from
   Realized Revenue (Financial Truthfulness).
4. The Lost/Dead limitation (PV-1) is disclosed honestly in the UI (Information Quality).
5. Deals without a fee contribute $0 and are shown as "fee not set" — never estimated.
6. Every contributing deal traces to its Opportunity Workspace (Revenue Evidence · Revenue Traceability).
7. No new top-level navigation; discovered through the workflow (Financial Workspace Progression).
8. Owner = Revenue; derives explicitly from Expected (`assignmentFeeUsd`), never implicitly (Financial State
   Authority).
9. No schema / API / new financial calculation / accounting / forecasting authority.

## 9. Release criteria

Per-increment: isolated production-equivalent build · app + script TypeScript · ESLint · unit · full Playwright ·
**migration delta NONE · API delta NONE**. Then the established Accepted → Released lifecycle (isolated builds):
milestone acceptance → Release Candidate (dry-run) → production deployment → production verification (Pipeline Value
total + breakdowns + traceability on `/revenue`; Realized/Pipeline-Value separation; Opportunity/Revenue/GU/Closing
regressions) → release record → click-path Discoverability Verification → formal close.

## 10. Guiding principles preserved

Financial Truthfulness · Revenue Evidence · Revenue Traceability · Active Evidence · Revenue State Progression ·
Financial Workspace Progression · Financial State Authority · Forecast Integrity — plus the platform workspace
contracts. **Pipeline Value is Operational Inventory and is never described or presented as a forecast.**

## Stop point

Planning complete; one founder decision open (**PV-1** — ship now with the disclosed Lost/Dead limitation, or build
G-1 first). Stop for review. No implementation until a separate **APPROVED TO IMPLEMENT**.
