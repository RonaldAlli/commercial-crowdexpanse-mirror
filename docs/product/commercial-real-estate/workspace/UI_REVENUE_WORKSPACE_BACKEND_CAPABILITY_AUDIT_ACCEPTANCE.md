# Revenue Workspace — Backend Capability Audit — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-31). Accepts
> `UI_REVENUE_WORKSPACE_BACKEND_CAPABILITY_AUDIT.md` (PR #90, merged to `main` `94801e2`). Recommendation
> **PARTIALLY READY** accepted. Context: [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## Recorded

- Existing **realized revenue** authority confirmed (BI Rule 1: SUM executed assignment-fee snapshots).
- **Projected economics** authority confirmed (underwriting scenarios).
- **Revenue intelligence** confirmed (`lib/business-intelligence`, `/insights`).
- **Revenue lifecycle** authority confirmed (pipeline facts CONTRACT_EXECUTED → ASSIGNMENT_EXECUTED →
  SETTLEMENT_COMPLETED → TRANSACTION_CLOSED).
- **Accounting** authority **absent**.
- **Settlement** authority **partial** (state fact only; no settlement values).
- **Partner** authority **absent**.
- **Forecasting** authority **absent**.
- Recommendation **PARTIALLY READY** accepted.

## Governing refinement — three separated revenue concepts (new contract)

Revenue is divided into three concepts that the workspace must **never combine**:

| Concept | Origin | Status | Existing authority it maps to |
|---|---|---|---|
| **Projected Revenue** | Guided Underwriting | Estimate | underwriting scenario (`ScenarioLineItem.spreadUsd`, `FinancingCaseResult.*`) — projected |
| **Expected Revenue** | Closing | Expected to be received | `Opportunity.assignmentFeeUsd` (contracted fee) |
| **Realized Revenue** | Settlement | Actually received | `AssignmentRecord.executedFeeUsdSnapshot` WHERE status=EXECUTED |

Operator progression: **Projected → Expected → Realized.** Each number has a different meaning; the workspace
labels each by intent (Information Quality + Explicit Intent Navigation) and keeps them visually and semantically
distinct.

## Milestone scope

- **Milestone 1 = Realized Revenue** (explicitly named). Answers *"What revenue has actually been earned?"* —
  not *"what might we earn?"* (projected) nor *"what should we invoice?"* (accounting). Built entirely over
  proven authority; no new calculations, schemas, or APIs.
- **Deferred (each its own backend program, not a UI enhancement):** Forecasting · Accounting · Partner
  distributions · Commission engine · Settlement statements · Payment reconciliation.

## Next governed phase

**Revenue Workspace — Milestone 1 (Realized Revenue) — APPROVED TO PLAN.** Planning package:
`UI_REVENUE_WORKSPACE_MILESTONE_1_PLAN.md` — exposes existing realized-revenue authority while clearly separating
projected/expected/realized throughout. Stop for review; no implementation.
