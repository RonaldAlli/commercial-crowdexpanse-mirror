# E2 · Slice B.3 — Acyclic trace / cycle guard (PE-INV-9) · Epic Exit Gate

> Adds **PE-INV-9 · Acyclic trace** as a real termination guarantee (not just documentation). Unifies the evaluator
> on one path-aware recursion so a cyclic rule-set fails closed instead of looping forever. Branch
> `feat/opp-pipeline-e2b3-cycle-guard` off `main` (`2fcd304`). Code-only. 2026-07-22.

## What changed

- **`lib/pipeline-predicates/evaluator.ts`** — unified on a single `evaluateInternal(predicateId, cbase, path)`
  recursion producing the canonical `EvaluationArtifact`; the result-only entries (`evaluatePredicate`, `evaluate`)
  are projections (`.result`). The `path` is the predicate stack: a predicate already on it returns a fail-closed
  `CYCLE_DETECTED` result **without recursing** (PE-INV-9). Diamonds (same predicate via two branches) are not
  cycles — each branch carries its own path and evaluates independently. Determinism, PE-INV-1/2/6/7/8 all preserved.
- **`docs/architecture/PREDICATE_ENGINE_DESIGN.md` + `EVALUATION_RESULT_CONTRACT.md`** — PE-INV-9 documented.
- **`scripts/e2e-predicate-cycle.mjs`** — 9 assertions: mutual cycle A→B→A terminates + fails closed + emits a
  `CYCLE_DETECTED` trace node; self-cycle terminates; **diamond is not a cycle** (DIA_LEAF twice, no false report);
  cyclic evaluation still referentially transparent.

## Why a guard (not just a doc)

Without the guard, a cyclic predicate set would recurse until stack overflow — a real robustness gap as composed
predicates grow. The guard converts that into a deterministic, fail-closed `CYCLE_DETECTED` verdict, so the trace is
always a finite tree (Law 9: the invariant now has coverage).

## Gate (clean worktree)

```
Architecture satisfied            ✓  one recursion · path-aware · cycle fail-closed · trace stays a finite tree
Acceptance scenarios passing       ✓  cycle 9/9 (Law 9/11); AC-GI2 21/21 + trace 17/17 unchanged
Full E2E sweep                     ✓  48/48 (E1 · AC-FG · AC-GI2 · trace all green under the evaluator rewrite)
Traceability complete              ✓  PE-INV-9 → Design + EvaluationResult/Artifact contract → Decision Log
No constitutional violations       ✓  no semantic change · determinism + PE-INV-1/2/6/7/8 preserved
Ready for next epic                ✓  evaluator hardened + FINAL → E3 (Authorization)
```
**Build gate:** `tsc` 0 · e2e 48/48 · cycle 9/9 · unit 73 files · `build:isolated` ok.

## Deviations

- **Evaluator internals unified** on one recursion (`evaluateInternal`); `evaluatePredicate`/`evaluate` now project
  `.result` from the artifact. Public signatures + all outputs are unchanged (verified: AC-GI2 21/21, trace 17/17
  byte-stable). No external consumer used `makeContext`/`evaluate(id,ctx)` directly (verified by grep).

## State

Branch pushed; **NOT merged** (code + docs + test only, no migration). Awaiting acceptance → on acceptance,
FF-merge → produce `AUTHORIZATION_DECISION_CONTRACT.md` → begin E3 (Authorization).
