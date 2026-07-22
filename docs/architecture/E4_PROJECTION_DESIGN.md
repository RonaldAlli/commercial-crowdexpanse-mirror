# E4 · Projection — Technical Design (ratified decisions; for freeze before implementation)

> Projection derives operational **presentation** state from authoritative reasoning. It consumes the one
> evaluator's `EvaluationArtifact`s (never re-derives truth) and produces a first-class, disposable
> [`ProjectionResult`](./PROJECTION_RESULT_CONTRACT.md) (Law 4/8, PR-INV-1..9). Derives from OWN-1 (stage =
> deterministic furthest-fact projection), OWN-4 (stage spine), and the Phase-3
> [State-Transition Model](./OPPORTUNITY_PIPELINE_STATE_TRANSITION_MODEL.md). Founder-ratified w/ refinements
> 2026-07-22.

---

## 1. The function

```
project({ spine, evaluationArtifacts, projectionPolicy }) → ProjectionResult
```
Observational; consumes only immutable inputs (PR-INV-1/2). It does **not** evaluate predicates, read the ledger,
mutate facts, or authorize (PR-INV-3/4/5). `projectionId = H(spineId, spineVersion, projectionVersion, ordered
frontier evaluationIds)` — a deterministic identity.

## 2. `StageSpine` — first-class and versioned (refinement 1)

The progression model is data, versioned independently of projection code:

```
StageSpine = {
  spineId: string,
  spineVersion: string,
  entries: { stage: string, predicateId: string | null }[],   // ordered LEAD..PAID; LEAD has predicate null (base)
}
```

`ss-1` realizes the OWN-4 spine — each stage bound to its **decision-fact-presence predicate** (a stage is reached
iff its one decision fact is asserted, OWN4-INV-1):

| stage | predicateId (presence of the decision fact) |
|---|---|
| LEAD | `null` (base case) |
| UNDERWRITTEN | `STAGE:UNDERWRITING_APPROVED` |
| BUYER_MATCHED | `STAGE:BUYER_MATCHED` |
| LOI_ACCEPTED | `STAGE:LOI_ACCEPTED` |
| UNDER_CONTRACT | `STAGE:CONTRACT_EXECUTED` |
| CLEAR_TO_CLOSE | `STAGE:CLEAR_TO_CLOSE` |
| PAID | `STAGE:TRANSACTION_CLOSED` |

The `STAGE:*` predicates are **decision-fact-presence** predicates — additive registrations in the evaluator (the
sanctioned extension path, Predicate Engine Design §7). Stage projects from the *decision fact*, not the composite
policy predicate (the policy predicate gated the DECLARE in E3; the stage reflects the resulting fact). Predicates
consume decision-visible reads (retractions suppress — FactGraph §4.3).

## 3. Stage = furthest satisfied (refinements 1 & 2, PR-INV-8)

The caller evaluates **every** spine predicate through the one evaluator and passes the resulting artifacts.
Projection walks the spine and sets `stage` = the furthest entry whose artifact is `satisfied`
(`frontier.lastSatisfied()`); LEAD is the base. **Stage is derived only from `StageSpine` + artifacts** — never
from indicators/labels/derivedFacts/inconsistencies (PR-INV-8). It is total and may regress (OWN-1).

## 4. Frontier + completeness (refinement 2, PR-INV-9)

`frontier` carries **every** spine entry with its `predicateId`, `satisfied`, and embedded `artifact` — an
architectural artifact for debugging/replay/audit/analytics. `decidingArtifact = frontier.lastSatisfied().artifact`.
If any non-base spine predicate has no supplied artifact, projection sets `completeness: "PARTIAL"` and records which
are absent — it **never** evaluates a missing predicate itself (PR-INV-9). Otherwise `COMPLETE`.

## 5. Operational attention — separate model (refinement 3, §2a)

`indicators` / `labels` / `derivedFacts` are derived from each frontier artifact's authoritative **`result`**
(`satisfied` / `missing` / `reasons`), **never** from the trace. Examples: `BLOCKED_ON_EVIDENCE` (a nearer
predicate unsatisfied due to missing evidence), `NEEDS_REVIEW`. These **never** influence `stage` and `stage` never
implies them (PR-INV-8). Strictly derived + disposable (Law 4).

## 6. Core inconsistency taxonomy (refinement 4)

E4 implements exactly four (expandable later without a contract change):

1. **missing-predecessor** — a stage is satisfied while a nearer spine stage is not.
2. **conflicting-successor** — a further decision fact asserted while its predecessor was retracted.
3. **mutually-exclusive-active** — two mutually-exclusive decision facts both active (e.g. conflicting archetypes).
4. **retracted-predecessor-surviving-successor** — a predecessor decision retracted but a successor survives.

Surfaced as `explanation.inconsistencies` **and** as warn-not-block `indicators` (consistent with the guard policy);
they never change `stage` (PR-INV-8) and never error.

## 7. Acceptance (AC-OWN1-* / AC-STM-* / AC-OPP3-*)

Base LEAD · each stage projected from its decision-fact-presence · **regression** (a retracted decision moves stage
back) · furthest-fact selection across a full frontier · `PARTIAL` completeness when an artifact is absent · each of
the four inconsistencies · indicators sourced from `result` (not trace). **Every scenario also asserts
`ProjectionResult.evaluationArtifacts` (and each `frontier[i].artifact`) is byte-identical to the supplied
artifacts** — no reinterpretation, only organization (mirrors AUTH-INV-13 / PR-INV-7).

## 8. Boundaries / traceability

No predicate evaluation (E2·B) · no ledger read/reconstruction (Law 13) · no fact mutation (E1) · no authorization
(E3) · not persisted as authoritative truth (Law 4). `project → this design → ProjectionResult Contract + STM +
OWN-1/OWN-4 + EvaluationResult/Artifact Contract → Decision Log`.
