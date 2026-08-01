# Forecasting Backend Authority — Plan

> **Status: PLAN — AWAITING REVIEW. No UI, no schema, no migrations, no APIs — this defines authority, it does not
> build it.** Governed decision: *Forecasting Backend Authority — APPROVED TO PLAN* (business-definition +
> backend-authority planning). Baseline: `main 777bc87`. The deliverable is an accepted authority model that a
> future implementation program will build. Context: `REVENUE_FORECASTING_MODEL_BUSINESS_SPECIFICATION(_ACCEPTANCE).md`,
> `PIPELINE_VALUE_BUSINESS_PLAN.md`, [[crowdexpanse-operating-model]], [[engineering-bi-rule-1]].

## 0. Nature of this program (read the gates differently)

Every prior CRE program shipped a read-only façade with **migration delta NONE · API delta NONE**. This one is the
opposite: it exists to introduce **new backend authority**. When the *implementation* program runs, its RC/release
gates **will** show migrations and (likely) new write APIs — that is correct, not a regression. This planning phase
writes none of it.

## Phase 1 — Authority Audit (Active / Dormant / New)

| Capability | Classification | Note |
|---|---|---|
| Realized revenue (`AssignmentRecord.executedFeeUsdSnapshot`, EXECUTED) | **Existing Active** | terminal state; unchanged |
| Expected fee per deal (`Opportunity.assignmentFeeUsd`) | **Existing Active** | Forecast/Pipeline-Value input |
| Expected close date (`Opportunity.targetCloseDate`) | **Existing Active** | time-basis proxy (G-2) |
| Pipeline stage (`OpportunityStage`) | **Existing Active** | position; carries no probability |
| Pipeline Value derivation (Revenue) | **Existing Active** | shipped; population tightens after G-1 |
| Projected economics (underwriting scenarios) | **Existing Active** (sparse) | per-deal estimate |
| Historical conversion by channel (`closedWonConversionByChannel`) | **Existing Active** | *informs* policy; is **not** policy |
| Pipeline facts / projection engine | **Existing Dormant** | not used; not an evidence source |
| **Lost / Dead state (G-1)** | **NEW AUTHORITY REQUIRED** | no lost/dead state on the Opportunity today |
| **Expected Payment Date (G-2)** | **NEW AUTHORITY REQUIRED** | none today (only expected *close*) |
| **Stage Probability Policy (G-3)** | **NEW AUTHORITY REQUIRED** | no probability anywhere |
| **Forecast Snapshot (G-4)** | **NEW AUTHORITY REQUIRED** | no forecast record |
| **Forecast computation service** | **NEW AUTHORITY REQUIRED** | derives Forecast from the above |

Conclusion (as expected): forecasting requires **new authority** (G-1…G-4 + a computation service). The *inputs*
are Active; the *model* must be built.

## Business state model (the financial spine after G-1…G-4)

```
Projected ── contract ──▶ Expected ──┬── assignment EXECUTED ──▶ Realized   (positive terminal)
(underwriting)            (contracted │
                           open deal) └── marked LOST / DEAD ─────▶ Lost/Dead (negative terminal, G-1)

Pipeline Value = Σ Expected over OPEN pipeline (excl. Lost/Dead)                — operational inventory (Revenue)
Forecast       = Σ (Expected × stage-probability[G-3]) phased by pay-date[G-2]  — business model (Forecasting Engine),
                 over OPEN pipeline (excl. Lost/Dead), captured as a Snapshot[G-4]
```

Forward-only (Revenue State Progression); every transition explicit (Financial State Authority); a deal never
silently leaves the pipeline — it either **realizes** or is **explicitly Lost/Dead** (Inventory Integrity).

## Authority ownership (Financial State Authority)

| State | Owner |
|---|---|
| Projected | Underwriting |
| Expected | Opportunity |
| Pipeline Value | Revenue |
| **Forecast** | **Forecasting Engine** |
| Realized | Assignment Execution |
| **Lost / Dead** | **Opportunity** (deal lifecycle) |
| **Expected Payment Date** | **Opportunity** (proposed; see FD-5) |
| **Stage Probability Policy** | **Forecasting Engine** |

---

## G-1 — Lost / Dead authority (business definition)

- **Lost** — a deal that will **not** close for a *known* reason (declined, fell through, lost to a competitor).
- **Dead** — a deal that is **abandoned / gone cold** with no active intent, distinct from a formal loss.
- **Explicit, never inferred.** Both are operator-set business states with a **required reason, timestamp, and
  actor** (Active Evidence — no staleness heuristic; consistent with the standing "no Lost/Dead inference" rule).
- **Ownership:** Opportunity (deal lifecycle).
- **Transition rules:** an ACTIVE deal → LOST or DEAD (reason required); **terminal and forward-only** — a
  Lost/Dead deal does not re-enter the pipeline except by an explicit, audited reactivation decision (FD-1).
  Mutually exclusive with Realized.
- **Effects:** removes the deal from the **open-pipeline population** → **Pipeline Value tightens to exclude
  Lost/Dead** and its disclosed limitation is **removed**; excluded from the **Forecast population**; the
  disappearance reason is explicit (Inventory Integrity · Reconciliation Transparency).
- **⟶ FD-1:** Are Lost and Dead two distinct states or one "not-proceeding" state with a reason code? Is
  reactivation permitted (audited)? *Recommend: two states (Lost = decision, Dead = abandonment), reactivation
  allowed only via an explicit audited transition.*

## G-2 — Expected Payment Date (business definition)

- The date the fee is **expected to be received (cash)** — distinct from `targetCloseDate` (expected *close*).
- **Ownership:** Opportunity (proposed).
- **Relationship to Target Close Date:** **derived default = `targetCloseDate`**, **overridable** by an explicit
  value when known (e.g., set at closing). Until overridden it tracks `targetCloseDate`.
- **Transition rules:** mutable as the deal progresses; not a terminal state.
- **Mutable or derived:** **both** — derived default, explicitly settable (a "set value wins over derived" rule).
- **⟶ FD-2:** confirm derived-default-then-explicit (vs a fully separate mandatory field). *Recommend derived +
  overridable* (minimizes data entry; migrates cleanly from `targetCloseDate`).

## G-3 — Stage Probability Policy (business definition)

- A **versioned policy** mapping each `OpportunityStage` → win-probability (0–1). **Policy is DATA, not code**
  (precedent: `lib/pipeline-authorization/policy.ts` — "policy is DATA … each entry independently identifiable and
  versioned").
- **Ownership:** Forecasting Engine.
- **Governance:** policy changes are governed and auditable (who/when/why), like the AI-governance and
  pipeline-authorization patterns — a change is a new **version**, not a mutation.
- **Versioning + effective dating:** each policy has a `policyVersion` and an **effective date**; a forecast is
  computed against the policy **effective at the forecast's effective date**, and the snapshot (G-4) records which
  version it used.
- **Historical conversion may inform, never become, policy** (Forecast Integrity · founder P-2). `closedWonConversion`
  is offered as *evidence* to the policy author; the policy value is an explicit decision.
- **⟶ FD-3:** the **initial probability values per stage** are a business decision (owner: founder). This plan
  defines the *mechanism*, not the numbers.

## G-4 — Forecast Snapshot (the snapshot contract — implements Forecast Integrity)

- Every forecast the platform displays **is a snapshot** — self-describing and reproducible (precedent: the
  immutable `OfferMemoSnapshot`, persisted verbatim with generator + schema versions).
- **Each snapshot records:** `modelVersion` · `assumptions` · `probabilityBasis` (the `policyVersion` used) ·
  `effectiveDate` · `population` (the contributing opportunities with their Expected fee, stage, probability, and
  expected-payment date **as at snapshot time**) · `calculationTimestamp` · the **computed result** (weighted
  total + time-phased breakdown).
- **Immutable** (persisted verbatim; never recomputed in place). A later change of policy/data produces a **new**
  snapshot, never an edit — so a forecast can always be explained from its own stored inputs.
- **Ownership:** Forecasting Engine.
- **⟶ FD-4:** time-phasing granularity (month vs quarter) and whether snapshots are on-demand, scheduled, or both.
  *Recommend: on-demand first, monthly phasing.*

## Pipeline Value / Forecast / Expected / Realized interaction (after G-1…G-4)

- **Expected** (Opportunity) and **Pipeline Value** (Revenue) are unchanged in meaning; the **population now
  excludes Lost/Dead** (G-1), so Pipeline Value's disclosed limitation is removed. Pipeline Value stays an
  **unweighted operational inventory** — G-3 probability is **never** applied to it.
- **Forecast** (Forecasting Engine) is a **separate**, probability-weighted, time-phased snapshot over the same
  open-pipeline population. It never overwrites or blends with Pipeline Value, Expected, or Realized (Financial
  Truthfulness · Financial Workspace Progression).
- **Realized** (Assignment Execution) is unchanged; **Lost/Dead** is the negative terminal. Reconciliation: open
  pipeline = Expected population; each member ends as Realized or Lost/Dead — never vanishing.

## Required backend entities / services (described, not schema)

1. **Opportunity lifecycle outcome (G-1)** — an explicit Lost/Dead state on the Opportunity with reason, actor,
   timestamp; default ACTIVE.
2. **Expected Payment Date (G-2)** — an optional explicit date on the Opportunity; derived default = `targetCloseDate`.
3. **Stage Probability Policy (G-3)** — a versioned, effective-dated policy entity (stage → probability), policy-as-data.
4. **Forecast Snapshot (G-4)** — an immutable snapshot entity capturing the §G-4 contract.
5. **Forecasting service** — a pure computation (Expected × policy-probability, phased by payment date) over the
   open, non-Lost/Dead population, emitting a snapshot; derives only from the above authorities (BI Rule 1/2 —
   no hidden metric).

## Migration implications

Real migrations (expected for this program): G-1 (Opportunity outcome state + reason fields; backfill all existing
deals to ACTIVE) · G-2 (nullable expected-payment-date; derived at read from `targetCloseDate` until set) · G-3
(new policy table + a seeded initial policy version) · G-4 (new snapshot table). All additive/backfilled; no
destructive change. Reversibility and backfill are release criteria for the implementation program.

## API implications

New **write** authority (a departure from prior read-only work): mark Lost/Dead (G-1, reason required) · set
Expected Payment Date (G-2) · author/version the probability policy (G-3, governed) · generate a forecast
snapshot (G-4). Read paths: Forecast snapshot(s) for the future UI. The implementation program's API/migration
deltas will be **non-NONE** — expected.

## Versioning strategy

`policyVersion` + effective date (G-3); `modelVersion` + snapshot-schema version (G-4, offer-memo precedent). Every
forecast snapshot pins the exact policy + model versions it used, so it is reproducible and auditable (Forecast
Integrity). Bump model version when computation changes; bump snapshot-schema version when the snapshot shape changes.

## Acceptance criteria (for THIS planning package)

1. Each required capability is classified Active / Dormant / New (Phase 1).
2. G-1…G-4 each have a business definition, ownership, transition rules, and effects.
3. The Pipeline Value / Forecast / Expected / Realized interaction is defined; Pipeline Value stays operational
   inventory, Forecast stays a business model, none blend.
4. Backend entities/services, migration implications, API implications, and versioning strategy are documented (not
   built).
5. Forecast Integrity · Financial State Authority · Revenue State Progression · Inventory/Reconciliation/Population
   Transparency are all honored by the design; no state derives another implicitly; no Lost/Dead inference.
6. Founder decisions FD-1…FD-5 are surfaced (below), not silently assumed.

## Release criteria (for the FUTURE implementation program, not this phase)

Additive reversible migrations with backfill · initial policy seeded + governed · snapshots immutable + reproducible ·
Pipeline Value population tightened and its Lost/Dead disclosure removed · full unit/integration/Playwright coverage ·
isolated verification builds · then the Accepted → Released lifecycle with production verification of the new
authority. (No forecasting UI in that program either — the Forecast UI is a *subsequent* Revenue Workspace M2 program.)

## Open founder decisions

- **FD-1** Lost vs Dead (two states vs one + reason); reactivation policy.
- **FD-2** Expected Payment Date: derived-default-then-explicit (recommended) vs fully separate field.
- **FD-3** Initial stage → probability **values** (a business decision; this plan defines only the mechanism).
- **FD-4** Time-phasing granularity + snapshot cadence (on-demand vs scheduled).
- **FD-5** Where Lost/Dead and Expected-Payment-Date live (Opportunity — recommended — vs a new lifecycle/closing record).

## Stop point

Planning package complete. Open the PR, present the authority model, and stop for review. **No backend
implementation begins until this plan is reviewed and a separate APPROVED TO IMPLEMENT decision is issued.**
