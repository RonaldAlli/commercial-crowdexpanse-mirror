# Revenue Forecasting Model — Business Specification — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts
> `REVENUE_FORECASTING_MODEL_BUSINESS_SPECIFICATION.md` (PR #107, merged to `main` `525c5f9`) with the founder
> decisions resolved below. This is the authoritative accepted business model. Context:
> [[crowdexpanse-cre-workspace]], [[crowdexpanse-operating-model]].

## Resolved founder decisions

- **P-1 — Population boundary: APPROVED (refined).** The open-pipeline population is **deals with an executed
  acquisition contract and not yet realized** — defined by *contractual commitment*, not a particular stage
  number. **Lost/Dead is an explicit business state** (a deal must never silently disappear from forecasting).
  *(Implies backend gap G-1: an explicit Lost/Dead state on the deal.)*
- **P-2 — Probability basis: APPROVED — stage-probability policy.** Forecast probability is **policy**, owned by
  the forecasting model. It is **never auto-derived** from historical conversion. Historical conversion is
  *evidence* that may *inform* the policy, but policy owns forecasting. *(Backend gap G-3: a versioned stage-
  probability policy.)*
- **P-3 — Time basis: APPROVED — `targetCloseDate` for Milestone 2** (immediate, understandable). Forecasting
  migrates to an **Expected Payment Date** later without changing the business model. *(Future gap G-2.)*
- **P-4 — Expected → Realized transition: APPROVED.** The sole authoritative transition is `AssignmentRecord →
  EXECUTED → Realized Revenue` — consistent with everything already released (Active Evidence, Revenue State
  Progression).
- **Pipeline Value: NOT deferred.** It is *not* forecasting — an unweighted **sum of Expected across the open
  pipeline** (operational inventory: no weighting, no probability, no modeling). It gets **its own small governed
  milestone before forecasting**, buildable over existing authority.

## The complete financial progression (each answers a different question; never collapses)

Projected → Expected → Pipeline Value → Forecast → Realized.

## New platform contract — Financial State Authority

**Every financial state has exactly one owner, and no state derives another implicitly — every transition is
explicit:**

| State | Owner |
|---|---|
| Projected | Underwriting |
| Expected | Opportunity |
| Pipeline Value | Revenue |
| Forecast | Forecasting Engine |
| Realized | Assignment Execution |

Complements Financial Truthfulness · Revenue Evidence · Revenue Traceability · Active Evidence · Revenue State
Progression · Financial Workspace Progression · Forecast Integrity.

## Recorded

Four-state financial model accepted · population boundary approved (executed acquisition contract, not yet
realized) · explicit Lost/Dead state approved · stage-probability policy approved (conversion informs, never
derives) · Target Close Date approved as interim time basis · assignment execution confirmed as Expected→Realized
transition · Pipeline Value recognized as operational inventory (its own milestone, not forecasting) · Financial
State Authority added as a platform contract.

## Governed program order (accepted)

1. **Pipeline Value** — small; fully buildable over existing authority (Σ Expected over the open-pipeline
   population). *Its own governed milestone.*
2. **Forecasting Backend Authority** — implements the business model (G-1 Lost/Dead state, G-3 stage-probability
   policy, G-4 forecast snapshot under Forecast Integrity; G-2 payment date later).
3. **Revenue Workspace — Milestone 2 (Forecast UI)** — built on the new authority, keeping Revenue / Pipeline
   Value / Forecast permanently separate.

**Next:** each of the three proceeds as its own governed program on the founder's explicit authorization; no
implementation begins until the next program is chartered (APPROVED TO PLAN).
