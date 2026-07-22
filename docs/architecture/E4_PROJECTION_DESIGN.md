# E4 · Projection — Technical Design (ratified decisions; for freeze before implementation)

> Projection derives operational **presentation** state by **observing active Decision Facts** in the FactGraph (it
> never re-derives truth). Optional `EvaluationArtifact`s are supporting explanation only. Produces a first-class,
> disposable [`ProjectionResult`](./PROJECTION_RESULT_CONTRACT.md) (Law 4/8, PR-INV-1..10). Derives from OWN-1
> (stage = deterministic furthest-fact projection), OWN-4 (stage spine), and the Phase-3
> [State-Transition Model](./OPPORTUNITY_PIPELINE_STATE_TRANSITION_MODEL.md). Founder-ratified w/ refinements
> 2026-07-22.

---

## 1. The function

```
project({ spine, graph, evaluationArtifacts?, projectionPolicy }) → ProjectionResult
```
Observational; consumes only immutable inputs (PR-INV-1/2): the **`FactGraph`** (to observe active Decision Facts),
the `StageSpine`, optional **supporting** `EvaluationArtifact`s (explanation only), and projection policy. It does
**not** evaluate predicates, read the ledger, mutate facts, or authorize (PR-INV-3/4/5). `projectionId =
H(spineId, spineVersion, projectionVersion, ordered active decision-fact ids, ordered supporting evaluationIds)`.

## 2. `StageSpine` — first-class, versioned, bound to Decision Facts (required refinement)

The progression model is data, versioned independently of projection code. **Each stage binds to a Decision Fact
type — NOT to an evaluator predicate.** No `STAGE:*` predicates are added to the evaluator; the reasoning layer stays
focused on "can this decision be declared?", while projection asks "has it been declared?".

```
StageSpine = {
  spineId: string,
  spineVersion: string,
  entries: { stage: string, decisionFactType: string | null }[],   // ordered LEAD..PAID; LEAD binds to null (base)
}
```

`ss-1` realizes the OWN-4 spine — each stage bound to its one Decision Fact (OWN4-INV-1):

| stage | Decision Fact type |
|---|---|
| LEAD | `null` (base case) |
| UNDERWRITTEN | `UNDERWRITING_APPROVED` |
| BUYER_MATCHED | `BUYER_MATCHED` |
| LOI_ACCEPTED | `LOI_ACCEPTED` |
| UNDER_CONTRACT | `CONTRACT_EXECUTED` |
| CLEAR_TO_CLOSE | `CLEAR_TO_CLOSE` |
| PAID | `TRANSACTION_CLOSED` |

## 3. Stage = furthest active Decision Fact (PR-INV-8/10)

Projection walks the spine and asks the **FactGraph** whether each stage's Decision Fact is **active**
(`graph.activeByType(decisionFactType)` present — decision-visible, so a retraction suppresses it, FactGraph §4.3).
`stage` = the furthest entry whose Decision Fact is active (`frontier.lastActive()`); LEAD is the base. **Stage is
derived only from `StageSpine` + active Decision Facts** — never from artifacts, indicators, labels, derivedFacts,
or inconsistencies (PR-INV-8/10). Total; may regress (OWN-1). No evaluator involvement for stage.

## 4. Frontier + completeness (PR-INV-9)

`frontier` carries **every** spine entry: its `decisionFactType`, whether it is `present` (active), and an
**optional** `supportingArtifact` (which explains *why* that decision exists). `decidingStage =
frontier.lastActive().stage`; `decidingArtifact` = that entry's supporting artifact if supplied. The frontier is
about **observed truth**; artifacts merely explain it. `completeness` is `COMPLETE` only when every entry has its
supporting artifact, else `PARTIAL` — projection never fabricates/self-evaluates a missing one (stage is always
determinable from the Decision Facts regardless).

## 5. Operational attention — separate model (§2a)

`indicators` / `labels` / `derivedFacts` are derived from each **supporting** artifact's authoritative **`result`**
(`satisfied` / `missing` / `reasons`) when present, **never** from the trace. Examples: `BLOCKED_ON_EVIDENCE`,
`NEEDS_REVIEW`. These **never** influence `stage` and `stage` never implies them (PR-INV-8). Strictly derived +
disposable (Law 4).

## 6. Core inconsistency taxonomy (refinement 4)

E4 implements exactly four (expandable later without a contract change):

1. **missing-predecessor** — a stage is satisfied while a nearer spine stage is not.
2. **conflicting-successor** — a further decision fact asserted while its predecessor was retracted.
3. **mutually-exclusive-active** — two mutually-exclusive decision facts both active (e.g. conflicting archetypes).
4. **retracted-predecessor-surviving-successor** — a predecessor decision retracted but a successor survives.

Surfaced as `explanation.inconsistencies` **and** as warn-not-block `indicators` (consistent with the guard policy);
they never change `stage` (PR-INV-8) and never error.

## 7. Acceptance (AC-OWN1-* / AC-STM-* / AC-OPP3-*)

Base LEAD · each stage projected from its active Decision Fact · **regression** (a retracted decision moves stage
back) · furthest-active selection across a full frontier · `PARTIAL` completeness when a supporting artifact is
absent · each of the four inconsistencies · indicators sourced from `result` (not trace). **Decision survives,
evaluation changes, projection unchanged** — a declared Decision Fact keeps projecting its stage even if predicate
logic/inputs later change; only a **retraction** moves the stage (projection observes facts, not hypothetical
current eligibility — PR-INV-10). **Every scenario also asserts `ProjectionResult.evaluationArtifacts` (and each
supplied `frontier[i].supportingArtifact`) is byte-identical to the supplied artifacts** — no reinterpretation, only
organization (mirrors AUTH-INV-13 / PR-INV-7).

## 8. Boundaries / traceability

No predicate evaluation (E2·B) · no ledger read/reconstruction (Law 13) · no fact mutation (E1) · no authorization
(E3) · not persisted as authoritative truth (Law 4). `project → this design → ProjectionResult Contract + STM +
OWN-1/OWN-4 + EvaluationResult/Artifact Contract → Decision Log`.
