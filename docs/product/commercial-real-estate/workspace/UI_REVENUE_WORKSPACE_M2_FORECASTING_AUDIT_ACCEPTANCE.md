# Revenue Workspace — Milestone 2 (Forecasting) — Backend Capability Audit — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts
> `UI_REVENUE_WORKSPACE_M2_FORECASTING_BACKEND_CAPABILITY_AUDIT.md` (PR #105, merged to `main` `d555a8c`).
> Recommendation **NOT READY** accepted. Context: [[crowdexpanse-cre-workspace]], [[crowdexpanse-operating-model]].

## Recorded

- Existing forecasting **inputs** confirmed (expected fee, target close date, opportunity stage, underwriting
  projections, historical conversion by channel) — all Active, but only inputs.
- **Forecasting authority absent · Forecast model absent · Probability model absent · Time-phasing absent ·
  Pipeline Value not yet defined.**
- Recommendation **NOT READY** accepted.
- **Pipeline Value distinguished from Forecast** (see the three views below).
- **Forecast Integrity added as a platform contract** (below).

## The three organizational financial views (must remain separate forever)

| View | Question | Basis |
|---|---|---|
| **Revenue (Realized)** | What has already happened? | Realized authority (executed assignment fees). |
| **Pipeline Value** | What has been contractually created? | Operational inventory — contracted expected fees on open deals. **No probabilities. Not a forecast.** |
| **Forecast** | What do we expect to happen? | A **business model** — probability, weighting, time-phasing, org policy. |

(Plus **Projected** — the per-deal underwriting estimate — which is analysis-time and distinct from all three org
views.)

## New platform contract — Forecast Integrity

**Forecasts are business models; they are never derived implicitly from operational data.** Every forecast the
platform displays must identify: **the forecasting model, the assumptions, the probability basis, and the
effective date.** This prevents a forecast from being mistaken for a financial fact. Complements Financial
Truthfulness · Revenue Evidence · Revenue Traceability · Active Evidence · Revenue State Progression · Financial
Workspace Progression.

## Next governed phase

**The next program is a business-definition initiative, not a software initiative:** **Revenue Forecasting Model —
APPROVED TO PLAN.** Deliverable = a business specification (`REVENUE_FORECASTING_MODEL_BUSINESS_SPECIFICATION.md`,
no code) defining Expected / Projected / Forecast Revenue and Pipeline Value; the populations; how probabilities
are determined; time-phasing; the Expected→Realized state transition and its triggering event; and which backend
objects own each concept. Only after that business model is accepted does backend implementation begin, then a
Revenue Workspace Milestone 2 UI on the new authority.
