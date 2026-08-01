# Revenue Forecasting Model — Business Specification (PROPOSED)

> **Status: BUSINESS SPECIFICATION — AWAITING REVIEW.** Governed decision: *Revenue Forecasting Model — APPROVED
> TO PLAN.* This is a **business-definition** deliverable — **no code, no schema, no API**. It defines the
> financial concepts, populations, probability basis, time-phasing, state transitions, and concept ownership that a
> future forecasting backend (then a Milestone-2 UI) would implement. Sections marked **⟶ FOUNDER DECISION** are
> genuine business-owner calls with a recommended default; the model is not final until those are ruled.
> Governed by [[crowdexpanse-operating-model]] (business → backend → UI). Contracts: Financial Truthfulness ·
> Revenue State Progression · Active Evidence · **Forecast Integrity**. Baseline authority per
> `UI_REVENUE_WORKSPACE_M2_FORECASTING_BACKEND_CAPABILITY_AUDIT.md`.

## 1. The four financial concepts (defined, kept separate forever)

| # | Concept | Definition | Probabilistic? | Existing authority |
|---|---------|-----------|----------------|--------------------|
| 1 | **Projected Revenue** | A per-deal *underwriting estimate* of deal economics (analysis-time). | No | `UnderwritingScenario` economics (Active-but-sparse) |
| 2 | **Expected Revenue** | The *contracted* fee on a specific open deal — what we expect to receive at closing, per deal. | No | `Opportunity.assignmentFeeUsd` (Active) |
| 3 | **Pipeline Value** | *Operational inventory* — the unweighted **sum of Expected** across a defined open-pipeline population. Not a forecast. | No | derivable from #2 + population (no new storage) |
| 4 | **Forecast Revenue** | *What we expect the organization to realize* — a **probability-weighted, time-phased** business model over the pipeline. | **Yes** | **none — new authority** |

**Realized Revenue** (already shipped, M1) = executed assignment fees. It is the terminal state, not part of the
forecast. Per Financial Truthfulness these five are never combined into one number.

## 2. Populations — which opportunities belong in each

Uses the existing `OpportunityStage` 13-stage pipeline (Active). Proposed membership:

- **Realized** — opportunities whose `AssignmentRecord.status = EXECUTED` (terminal; owns Realized Revenue).
- **Open pipeline (Expected / Pipeline Value / Forecast population)** — opportunities **past the point a fee is
  contracted** and **before Realized**, excluding Lost/Dead.
- **Excluded** — early leads before a fee is contracted; Lost/Dead deals.

**⟶ FOUNDER DECISION P-1:** the exact stage boundary where a deal *enters* the open-pipeline population (i.e. the
stage at/after which `assignmentFeeUsd` is considered a real Expected figure), and the definition of Lost/Dead
(there is currently no explicit "lost" stage/flag — see Gap G-1). *Recommended default:* enter at the first
post-contract stage; treat a deal as excluded only when explicitly marked lost (requires G-1).

## 3. Probability — how a deal's Forecast weight is determined

Forecast Revenue = Σ over the open pipeline of ( Expected × probability × time-phasing ). The probability basis is
the heart of the model and must be an explicit, auditable policy (Forecast Integrity).

**⟶ FOUNDER DECISION P-2 — probability basis.** Options:
- **(A) Stage-based policy table** *(recommended)* — an explicit, versioned probability per stage (e.g. a policy
  object mapping each `OpportunityStage` → win-probability). Transparent, auditable, easy to display as an
  assumption. Requires new authority (a probability policy table + version).
- **(B) Historical-conversion-based** — derive base rates from `closedWonConversionByChannel` (Active). Data-driven
  but by-channel-only today, unstable at low volume, and harder to explain per deal.
- **(C) Hybrid** — stage policy adjusted by historical conversion.

*Recommendation:* start with (A) — a governed stage-probability policy — because Forecast Integrity requires the
probability basis to be identifiable, and a policy table is the most transparent, and later blend in (B).

## 4. Time-phasing — when the forecast lands

Forecast is phased into periods (e.g. month/quarter) by *when* each deal is expected to convert to cash.

**⟶ FOUNDER DECISION P-3 — time basis.** `Opportunity.targetCloseDate` (Active) is an expected *close* date, not a
payment date. Options: **(A)** phase by `targetCloseDate` as a proxy *(recommended interim)*; **(B)** introduce an
explicit **expected-payment-date** authority (new; Gap G-2) for closes-vs-cash timing. *Recommendation:* (A)
initially, labeled "phased by expected close date"; add (B) when payment timing matters.

## 5. Revenue state machine — and the event that changes state

The forecast is the probabilistic middle of the same lifecycle Revenue State Progression already governs
(forward-only):

```
Projected            Expected                         Realized
(underwriting est.)  (contracted fee, open pipeline)  (executed fee)
      │                    │                                │
      └── contract established ──┘        └── ASSIGNMENT EXECUTED ──┘
          (fee committed)                    (AssignmentRecord.status → EXECUTED, resolvedAt)
```

- **Projected → Expected:** a fee is contracted (`assignmentFeeUsd` committed and the deal enters the open
  pipeline population).
- **Expected → Realized:** the **assignment is executed** — the active-authority event
  `AssignmentRecord.status → EXECUTED` (with `resolvedAt`), which is exactly the existing Realized-revenue trigger
  (Active Evidence). **This is the single authoritative state-change event.**
- **Forecast** is not a state a deal is *in*; it is the org-level probability-weighted view of the Expected
  population before Realized.

**⟶ FOUNDER DECISION P-4:** confirm that assignment execution is the sole Expected→Realized event (recommended —
it matches M1's realized authority), and whether a deal can leave the pipeline without realizing (Lost — needs
G-1).

## 6. Concept ownership — which backend object owns each concept

| Concept | Owner | Status |
|---|---|---|
| Realized Revenue | `AssignmentRecord.executedFeeUsdSnapshot` | **exists** |
| Expected Revenue (per deal) | `Opportunity.assignmentFeeUsd` + population membership (stage) | **exists** |
| Projected Revenue | `UnderwritingScenario` economics | **exists (sparse)** |
| Pipeline Value (org) | derived aggregation over Expected + population | **new (derivation only, no storage)** |
| Forecast Revenue | **new**: a **stage-probability policy** (versioned) + a **forecast snapshot/run** carrying model id, assumptions, probability basis, and **effective date** (Forecast Integrity) | **new authority** |
| Time-phasing | `targetCloseDate` (proxy) or new expected-payment-date | **partial / new** |

## 7. Gaps that become backend work (only after this model is accepted)

- **G-1 — Lost/Dead state.** No explicit "lost" stage or flag on `Opportunity` today; needed to bound the pipeline
  population truthfully.
- **G-2 — Expected-payment-date.** No payment-timing authority; `targetCloseDate` is a proxy.
- **G-3 — Stage-probability policy.** A versioned, governed policy object (per Forecast Integrity).
- **G-4 — Forecast snapshot.** An auditable forecast record (model + assumptions + probability basis + effective
  date) so a forecast is reproducible and never mistaken for a fact.
- **G-5 — Pipeline Value derivation.** A BI-layer aggregation of Expected over the population (small, and the
  *only* piece buildable over purely Active data — it could ship as an operational view **before** Forecast).

## 8. Recommended sequencing (business → backend → UI)

1. **Accept this business model** (rule the ⟶ FOUNDER DECISIONs P-1…P-4).
2. **Optional early win — Pipeline Value** (G-5): an operational-inventory view (unweighted Σ Expected on the open
   pipeline), buildable over Active data, honestly labeled "not a forecast." This is a candidate *separate* small
   milestone that does **not** require the forecasting model.
3. **Build forecasting backend authority** (G-1…G-4) governed by Forecast Integrity.
4. **Then plan the Revenue Workspace Milestone 2 UI** on that new authority (Forecast view), keeping Revenue,
   Pipeline Value, and Forecast permanently separate.

## Stop point

Business specification delivered. Awaiting review of the definitions and the four founder decisions (P-1…P-4),
plus a ruling on whether **Pipeline Value** (§8.2) should proceed as an early, Active-data operational view
separate from Forecast. No implementation, no backend, no UI until the business model is accepted.
