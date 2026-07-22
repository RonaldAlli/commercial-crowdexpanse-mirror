# ProjectionResult — Public Contract **v1.1** (FROZEN, pre-E4)

> **v1.1 (founder refinements):** first-class versioned `StageSpine`; `frontier` + `decidingArtifact` +
> `completeness`; indicators originate from the authoritative `EvaluationResult` (not the trace); PR-INV-8 (stage
> independence) + PR-INV-9 (frontier completeness).

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
FactGraph → EvaluationArtifact(s) → Projection → ProjectionResult
```
Never `FactGraph → stage string`. Projection consumes the **one evaluator's** artifacts (Law 6) and produces a
structured, disposable `ProjectionResult`.

## 2. `ProjectionResult` (v1.0)

```
ProjectionResult = {                 // v1.1
  projectionId:      string,   // deterministic identity of this projection (H of its inputs) — like evaluationId/decisionId
  projectionVersion: string,   // the projection policy/config version applied
  spineVersion:      string,   // the StageSpine version projected against

  // AUTHORITATIVE-of-the-derived-layer (still derived + disposable overall — Law 4):
  stage:        string,        // OWN-1 furthest-fact projected stage (OWN-4 spine: LEAD … PAID)
  completeness: "COMPLETE" | "PARTIAL",   // whether every spine predicate had an artifact (PR-INV-9)
  labels:       { code: string, detail?: string }[],   // operational display labels
  indicators:   { code: string, detail?: string }[],   // operational-attention indicators, derived from EvaluationRESULTs (§2a)

  // DERIVED explanation (preserves, never reinterprets, the evaluator output — PR-INV-7):
  frontier:         FrontierEntry[],           // EVERY spine predicate + its artifact + satisfied (an architectural artifact)
  decidingArtifact: EvaluationArtifact | null, // = frontier.lastSatisfied() (LEAD/base ⇒ null)
  evaluationArtifacts: EvaluationArtifact[],    // all consumed artifacts, embedded byte-identical (PR-INV-7)
  derivedFacts: { code: string, detail?: string }[], // computed/disposable derived values
  explanation:  { reasoning: string[], decidingPredicateId?: string | null, inconsistencies: Inconsistency[] },
}

FrontierEntry = { stage: string, predicateId: string | null, satisfied: boolean, artifact: EvaluationArtifact | null }
Inconsistency  = { code: string, detail?: string }   // core taxonomy (design §): missing-predecessor / conflicting-successor / mutually-exclusive-active / retracted-predecessor-surviving-successor
```

Everything here is **derived and disposable** — the whole `ProjectionResult` can be discarded and recomputed from
`Ledger → FactGraph → Evaluator` at any time (Law 4). It is authoritative for nothing; it *presents* authoritative
facts. `projectionId` is a deterministic **identity** (content address), not an execution id.

### 2a. Indicators originate from the authoritative EvaluationResult (not the trace)

`indicators` (and `derivedFacts`) are derived from each frontier artifact's **`result`** (`satisfied` / `missing` /
`reasons` — the authoritative outcome), **never** from the `trace` structure. The trace is explanatory; the result
is authoritative; an indicator must always originate from the authoritative result.

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
- **PR-INV-8 · Stage independence.** `stage` is derived **only** from `StageSpine` + `EvaluationArtifacts`; it is
  **never** influenced by `indicators`, `labels`, `derivedFacts`, or `inconsistencies` (and they are never derived
  from `stage`). Stage and operational attention are different models and must not cross-contaminate.
- **PR-INV-9 · Frontier completeness.** For a spine of N decision predicates, projection must either receive all N
  corresponding `EvaluationArtifact`s or explicitly report `completeness: "PARTIAL"`. It never silently evaluates a
  missing predicate itself (it consumes the one evaluator's artifacts — PR-INV-4).

## 4. Symmetry with the rest of the stack

Same shape as every layer: immutable input → deterministic core → authoritative-of-its-layer output → preserved
explanation.

```
Evaluation:     FactGraph          → Evaluator     → EvaluationResult     + Trace
Authorization:  EvaluationArtifact → Authorization → AuthorizationDecision(decision) + explanation
Projection:     EvaluationArtifact → Projection    → ProjectionResult(stage/labels/indicators) + explanation
```

## 5. Out of scope

No fact mutation, no authorization, no predicate evaluation, no persistence as authoritative truth, no execution/
timing metadata. Those belong to E1/E3/E2·B or the operational layer.
