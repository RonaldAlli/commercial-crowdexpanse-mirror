# ProjectionResult — Public Contract **v1.2** (FROZEN, pre-E4)

> **v1.1:** first-class versioned `StageSpine`; `frontier` + `decidingArtifact` + `completeness`; indicators from the
> authoritative `EvaluationResult` (not the trace); PR-INV-8 (stage independence) + PR-INV-9 (frontier completeness).
> **v1.2 (founder refinement):** stage is projected by **observing active Decision Facts** — the spine binds stages
> to Decision Fact types, NOT to evaluator predicates; `EvaluationArtifact`s are optional supporting explanation.
> Added PR-INV-10 (projection observes decisions). No `STAGE:*` predicates in the evaluator.

> **What this freezes:** the *output* of E4 Projection — the derived, user-facing **operational state** computed
> from authoritative data. Frozen before implementation, like the E1 ledger API, Fact Graph API, EvaluationResult/
> Artifact, and AuthorizationDecision contracts. Projection is the first layer that turns authoritative facts into
> operational display, so its output is a first-class object — **never a loose stage string**. Derives from OWN-1
> (stage = deterministic furthest-fact projection), OWN-4 (stage spine), and the Phase-3
> [State-Transition Model](./OPPORTUNITY_PIPELINE_STATE_TRANSITION_MODEL.md). Consumes the finalized
> [EvaluationResult/Artifact](./EVALUATION_RESULT_CONTRACT.md). Governed by Constitution Law 4 (derived/disposable)
> and Law 8 (observational). 2026-07-22.
>
> **Change discipline:** identical to the other frozen contracts — `Code → Architecture → Specification → Business
> Decision`. Breaking change ⇒ major bump + decision process; additive ⇒ minor.

---

## 1. The pipeline (first-class object, not a bare stage)

```
FactGraph (active Decision Facts) → Projection → ProjectionResult
        (optional supporting EvaluationArtifacts explain WHY those facts exist)
```
Never `FactGraph → stage string`. **Stage is projected by OBSERVING active Decision Facts in the FactGraph**
(PR-INV-10), not by asking the evaluator "is this currently eligible?" — the evaluator already answered that before
the decision was authorized and declared. `EvaluationArtifact`s are **optional supporting explanation** (they
explain why a decision fact exists), never the stage driver.

## 2. `ProjectionResult` (v1.0)

```
ProjectionResult = {                 // v1.1
  projectionId:      string,   // deterministic identity of this projection (H of its inputs) — like evaluationId/decisionId
  projectionVersion: string,   // the projection policy/config version applied
  spineVersion:      string,   // the StageSpine version projected against

  // AUTHORITATIVE-of-the-derived-layer (still derived + disposable overall — Law 4):
  stage:        string,        // OWN-1 furthest-fact projected stage = furthest spine stage whose Decision Fact is active
  completeness: "COMPLETE" | "PARTIAL",   // whether every frontier entry has its supporting artifact (explanation completeness — PR-INV-9)
  labels:       { code: string, detail?: string }[],   // operational display labels
  indicators:   { code: string, detail?: string }[],   // operational-attention indicators, from supporting EvaluationRESULTs (§2a)

  // DERIVED explanation (preserves, never reinterprets, the evaluator output — PR-INV-7):
  frontier:         FrontierEntry[],           // EVERY spine entry: its Decision Fact, present/active, + optional supporting artifact
  decidingStage:    string,                    // = frontier.lastActive().stage (LEAD ⇒ base)
  decidingArtifact: EvaluationArtifact | null, // optional supporting artifact for the deciding decision (null if none supplied)
  evaluationArtifacts: EvaluationArtifact[],    // supporting artifacts supplied, embedded byte-identical (PR-INV-7)
  derivedFacts: { code: string, detail?: string }[], // computed/disposable derived values
  explanation:  { reasoning: string[], decidingDecisionFactType?: string | null, inconsistencies: Inconsistency[] },
}

// The frontier is fundamentally about OBSERVED TRUTH; the artifact only explains why that truth exists.
FrontierEntry = { stage: string, decisionFactType: string | null, present: boolean, supportingArtifact: EvaluationArtifact | null }
Inconsistency  = { code: string, detail?: string }   // core taxonomy (design §6): missing-predecessor / conflicting-successor / mutually-exclusive-active / retracted-predecessor-surviving-successor
```

Everything here is **derived and disposable** — the whole `ProjectionResult` can be discarded and recomputed from
`Ledger → FactGraph → Evaluator` at any time (Law 4). It is authoritative for nothing; it *presents* authoritative
facts. `projectionId` is a deterministic **identity** (content address), not an execution id.

### 2a. Indicators originate from the authoritative EvaluationResult (not the trace)

`indicators` (and `derivedFacts`) are derived from each **supporting** artifact's **`result`** (`satisfied` /
`missing` / `reasons` — the authoritative outcome) when one is present, **never** from the `trace` structure. The
trace is explanatory; the result is authoritative; an indicator must always originate from the authoritative result.

## 3. Projection invariants (PR-INV)

- **PR-INV-1 · Observational only.** Projection reads and computes; it never writes (Law 8).
- **PR-INV-2 · Immutable inputs only.** It consumes only the `FactGraph`, `EvaluationArtifact`(s), and projection
  policy/configuration — nothing else.
- **PR-INV-3 · Never mutates facts.** No ledger write, no supersession.
- **PR-INV-4 · Never evaluates predicates independently.** It consumes the one evaluator's artifacts; it does not
  re-derive business truth (Law 6/13).
- **PR-INV-5 · Never authorizes.** Permission is E3; projection presents state, it does not gate operations.
- **PR-INV-6 · Disposable and reconstructable.** The `ProjectionResult` is derived state (Law 4) — never persisted
  as authoritative truth; always regenerable.
- **PR-INV-7 · Explanation preservation.** The consumed `EvaluationArtifact`(s) are embedded unchanged; projection
  may only *append* projection-specific reasoning, never rewrite or reinterpret the evaluator's explanation (mirrors
  AUTH-INV-13).
- **PR-INV-8 · Stage independence.** `stage` is derived **only** from `StageSpine` + **active Decision Facts**; it
  is **never** influenced by `indicators`, `labels`, `derivedFacts`, or `inconsistencies` (and they are never derived
  from `stage`). Stage and operational attention are different models and must not cross-contaminate.
- **PR-INV-9 · Frontier completeness.** The frontier reports every spine entry. `completeness` is `COMPLETE` only
  when every entry has its supporting `EvaluationArtifact`; otherwise `PARTIAL` — projection never fabricates or
  self-evaluates a missing supporting artifact (stage itself is always determinable from the Decision Facts alone).
- **PR-INV-10 · Projection observes decisions.** Projection derives `stage` from `StageSpine` → **active Decision
  Facts** in the FactGraph — never directly from business predicates. Business predicates exist to *authorize
  decision creation* (E2·B/E3); a declared Decision Fact *becomes truth* (E1); Projection *observes truth* (E4).
  Chain: `Predicate → Authorization → Decision Fact → Projection` — never `Predicate → Projection`.

## 4. Symmetry with the rest of the stack

Same shape as every layer: immutable input → deterministic core → authoritative-of-its-layer output → preserved
explanation.

```
Evaluation:     FactGraph               → Evaluator     → EvaluationResult     + Trace
Authorization:  EvaluationArtifact      → Authorization → AuthorizationDecision(decision) + explanation
Projection:     active Decision Facts   → Projection    → ProjectionResult(stage/labels/indicators) + explanation
                (+ optional supporting EvaluationArtifacts as explanation)
```

## 5. Out of scope

No fact mutation, no authorization, no predicate evaluation, no persistence as authoritative truth, no execution/
timing metadata. Those belong to E1/E3/E2·B or the operational layer.

## 6. Evolution & consumption (founder guidance, non-blocking)

**6.1 StageSpine evolution.** `StageSpine` is versioned (`spineId`/`spineVersion`); changes are a **new spine
version**, never an in-place edit. Permitted evolutions: *additive* stages, *reordered* stages, *retired* stages —
each as a new `spineVersion`. A projected `ProjectionResult` records the `spineVersion` it was computed under, so a
consumer always knows the progression model in force. Migrating an opportunity from one spine version to another is
a deliberate, versioned step (not silent).

**6.2 Spine and policy are independently versioned (orthogonal).** `StageSpine` determines **progression** (which
Decision Facts map to which stages); `ProjectionPolicy` determines **presentation** (indicators, labels,
mutual-exclusion, derived facts). They evolve independently — a presentation change must not require a spine bump,
and vice versa. `ProjectionResult` stamps both (`spineVersion`, `projectionVersion`).

**6.3 Consumer discipline (API/UI).** Downstream consumers treat `ProjectionResult` exactly as Authorization treats
`EvaluationArtifact`: **consume, never reinterpret, never recompute, never infer hidden semantics.** Projection owns
presentation; a consumer that needs a value the result doesn't carry extends *projection* (here), never re-derives
it downstream (mirrors FG-INV-12 / PR-INV-4).
