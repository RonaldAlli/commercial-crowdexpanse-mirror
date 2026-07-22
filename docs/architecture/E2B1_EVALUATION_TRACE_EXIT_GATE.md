# E2 · Slice B.1 — EvaluationTrace (evaluator v1.1) · Epic Exit Gate

> Additive derivation of the ratified [EvaluationResult / EvaluationArtifact contract](./EVALUATION_RESULT_CONTRACT.md)
> §4. Completes the evaluator as a foundational service before any subsystem consumes it. Branch
> `feat/opp-pipeline-e2b1-evaluation-trace` off `main` (`d6c405d`). Code-only. 2026-07-22.

## What was built

- **`lib/pipeline-predicates/types.ts`** — `TraceNode` (logical-only: predicateId, satisfied, reasons, factsRelied,
  missing, children), `EvaluationTrace { root }`, `EvaluationArtifact { result, trace }`.
- **`lib/pipeline-predicates/evaluator.ts`** — new **`evaluateArtifact(predicateId, input) → EvaluationArtifact`**:
  the single output object. The trace tree is assembled around the same composition boundary (`context.evaluate`)
  that predicates already use, so sub-evaluations become child nodes in call order. `EvaluationResult` v1.0 entries
  (`evaluate`, `evaluatePredicate`, `makeContext`) are **unchanged** — `artifact.result` is byte-identical to them.
  Result + trace + nodes are frozen (deterministic, disposable).
- **`scripts/e2e-evaluation-trace.mjs`** — 13 assertions: artifact shape · trace-explains-result · call tree
  (CLEAR_TO_CLOSE→DILIGENCE_COMPLETE; THIRD_PARTY_FINANCED→CASH) · PE-INV-6 determinism · logical-only nodes (exact
  key set, no timing/exec) · immutability · negative-path completeness.

## Invariants → coverage

| Invariant | AC |
|---|---|
| PE-INV-6 · trace determinism (identical inputs ⇒ identical result+trace) | [3] |
| PE-INV-7 · trace completeness (every result reason in the tree) | [1], [6] |
| trace explains result (root mirrors result; children = composition) | [1], [2] |
| logical-only (no timestamps/durations/exec/random) | [4] |
| derived + disposable (frozen; never mutable business truth) | [5] |

## Gate (clean worktree)

```
Architecture satisfied            ✓  single output object · trace around ctx.evaluate · deterministic · logical-only · frozen
Acceptance scenarios passing       ✓  trace 13/13 (Law 11)  — scripts/e2e-evaluation-trace.mjs
Full E2E sweep                     ✓  47/47 (E1 · AC-FG 25/25 · AC-GI2 21/21 all still green; v1.0 entries unchanged)
Traceability complete              ✓  EvaluationTrace → EvaluationResult/Artifact contract §4 + PE-INV-6/7 → Design → Decision Log
No constitutional violations       ✓  Law 4 (trace derived/disposable, not persisted truth) · Law 6/8 · PE-INV-2 extends to trace
Ready for next epic                ✓  E3 consumes a finalized evaluator (result authoritative, trace explanatory)
```
**Build gate:** `tsc` 0 · e2e 47/47 · trace 13/13 · unit 73 files · `build:isolated` ok.

## Deviations

- None beyond the ratified design. `EvaluationArtifact` is named per the founder's choice; a one-line note
  distinguishes it from the GI-3 ARTIFACT fact class.

## State

Branch pushed; **NOT merged** (code-only, no migration). Awaiting acceptance → on acceptance, FF-merge → freeze the
evaluator output contract as final → begin E3 (Authorization).
