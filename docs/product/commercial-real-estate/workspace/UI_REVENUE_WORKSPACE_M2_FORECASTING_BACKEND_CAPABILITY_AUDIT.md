# Revenue Workspace — Milestone 2 (Forecasting) — Backend Capability Audit

> **Governed program: CRE Revenue Workspace — Milestone 2 (Forecasting) — APPROVED TO PLAN, Phase 1.** Read-only
> audit of current `main ced6375`, focused on **forecasting** authority and applying the **Active vs Dormant**
> classification adopted after the Milestone-1 audit correction. **No schemas proposed, no APIs designed, no
> calculations implemented.** The one question: *what forecasting authority actually exists today?* Recommendation
> at the end. Context: `UI_REVENUE_WORKSPACE_BACKEND_CAPABILITY_AUDIT.md` (+ its dormant-authority correction),
> [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## Why this audit is different from Milestone 1

Realized Revenue (M1) reused an **existing authoritative population** (executed assignments). Forecasting is not a
population that already exists — it is a **model** (which deals count, weighted by what probability, phased over
what time, paid when). So the first question is authority, not UI.

## Authority classification key

- **Active Authority** — production-backed, write-path on. Eligible to back a production workspace.
- **Active-but-sparse** — write-path on, but little/no production data yet.
- **Dormant Authority** — implemented but not producing production evidence (must not back production).
- **Missing Authority** — does not exist.

## 1. Projected revenue authority

- **Underwriting scenario economics** — `ScenarioLineItem.spreadUsd`, `FinancingCaseResult.netSaleProceedsUsd /
  totalProfitUsd / equityMultiple / leveredIrrPct` (`prisma/schema.prisma`). **Active** (Guided Underwriting and
  `/analyzer` are live), but **per-deal / per-scenario**, and **Active-but-sparse** (≈0 active scenarios in prod
  today). **No single "projected revenue" figure exists** — which underwriting output equals "revenue" is
  undefined (a business decision), and there is **no org-level aggregation**.
- **`DealAnalysis`** (`purchasePriceUsd`, `closingCostsUsd`, income/expense) — Active analysis inputs, not a
  revenue projection.

## 2. Expected revenue aggregation

- Per-deal **expected** figure = `Opportunity.assignmentFeeUsd` (**Active**, contracted). Expected **timing** =
  `Opportunity.targetCloseDate` (**Active**, expected *close* — not payment).
- **No aggregation exists.** There is no service that sums expected fees across a defined pipeline population, and
  **no population definition** ("which stages count as open/expected"). Aggregating requires a business decision.

## 3. Forecasting services

- **Missing.** No `forecast*`, `projectedRevenue`, `expectedRevenue`, `weightedPipeline`, or period/time-phased
  service exists in `lib/` or `app/`. BI is explicitly **all-time** (the Command Center already declares
  "Period-based revenue" as an *unavailable capability*).

## 4. Pipeline value

- **Missing.** No pipeline-value or weighted-pipeline authority. `Opportunity.stage` (Active) gives position but
  **carries no probability/win-rate** — there is **no stage→probability mapping anywhere**.
- **Partial input (Active):** `closedWonConversionByChannel` (`lib/business-intelligence`) gives **historical**
  conversion rate **by channel** — a possible *input* to a future forecasting model, but by-channel only, not
  by-stage, and historical (not a forecast).

## 5. Expected payment dates

- **Missing.** Only `Opportunity.targetCloseDate` (expected *close*) exists. There is **no expected-payment-date,
  no `paidAt`/`receivedAt`-for-revenue, no payout/settlement date** authority (`receivedAt` exists only on
  `OpportunityDiligenceItem` — a diligence receipt, unrelated). Settlement itself is dormant (M1 correction).

## 6. Active vs Dormant summary

| Capability | State |
|---|---|
| Per-deal expected fee (`assignmentFeeUsd`) | **Active** |
| Expected close date (`targetCloseDate`) | **Active** |
| Pipeline stage (`OpportunityStage`) | **Active** (no probability attached) |
| Underwriting projected economics (scenarios) | **Active-but-sparse** (per-deal; no "revenue" figure; no aggregation) |
| Historical conversion by channel (BI) | **Active** (an input, not a forecast) |
| Stage probability / win-rate / weighting | **Missing** |
| Expected-revenue / pipeline-value aggregation | **Missing** |
| Forecasting / time-phasing / period service | **Missing** |
| Expected payment dates | **Missing** |
| Settlement authority | **Dormant** (pipeline facts) |

## 7. What could be shown today (honestly) vs what forecasting needs

- **Buildable over Active data today (NOT forecasting):** a narrow, explicitly-labeled *"expected pipeline value =
  unweighted sum of contracted assignment fees on open opportunities"* — and even this requires a **business
  decision** defining the population ("which stages are open/expected"). It is **Expected aggregation, not a
  forecast** (no probability, no time-phasing), and under Financial Truthfulness must be labeled as such.
- **Forecasting proper needs NEW authority that does not exist:** a forecasting **model** — population definition,
  per-stage probability/weighting, time-phasing, pipeline value, and expected-payment timing. None of this is
  present, and (per Financial Truthfulness + Active Evidence) a "forecast" cannot be presented without
  authoritative forecasting logic — doing so would fabricate financial truth.

## Recommendation

**NOT READY.**

Forecasting cannot be built truthfully over existing authority: the **forecasting model authority is Missing**
(stage probability/weighting, expected-revenue & pipeline-value aggregation, time-phasing, expected-payment
dates). The *inputs* are Active (expected fee, expected close, projected underwriting economics, historical
conversion), but there is no authoritative way to combine them into a forecast today.

**Suggested next decision (not a UI plan):** Milestone 2 should begin with a **business definition of the
forecasting model** — the CAOS/business-then-backend discipline — answering: what does "expected revenue" and
"projected revenue" mean at the org level; what is the pipeline population; what probability/weighting basis
(stage-based? historical-conversion-based?); what time-phasing; and where do expected-payment dates come from.
Only after that business definition and the backend authority it implies exist should a forecasting UI be planned.
A narrow, honestly-labeled *expected pipeline value* (unweighted sum of open-deal contracted fees) is the only
Active-data option available before then, and even it needs a population-definition decision — it is not
forecasting.

**Stop point:** audit complete; recommendation = **NOT READY**. Awaiting review. No implementation, no merge, no
deployment.
