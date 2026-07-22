# E2 · Slice B.2 — Trace locality (PE-INV-8) · Epic Exit Gate

> Finalizes the evaluator output contract. Adds **PE-INV-8 · Trace locality** with acceptance coverage (Law 9), and
> records the trace-navigation API as a deferred v1.2. No evaluator code change — locality holds by construction;
> this slice proves and freezes it. Branch `feat/opp-pipeline-e2b2-trace-locality` off `main` (`8ed5c22`). 2026-07-22.

## What changed

- **`docs/architecture/PREDICATE_ENGINE_DESIGN.md`** — PE-INV-8: every trace node explains only its own predicate +
  immediate children; no subtree hoisting/summarizing.
- **`docs/architecture/EVALUATION_RESULT_CONTRACT.md`** — PE-INV-8 added; navigation API (`self`/`children`/
  `flatten`/`find`) documented as **deferred v1.2** (nodes stay pure serializable data now); contract marked
  **FINAL** (`EvaluationResult` v1.0 + `EvaluationArtifact` v1.1).
- **`scripts/e2e-evaluation-trace.mjs`** — section [7], 4 locality assertions: children are exactly the immediate
  sub-evaluations; leaf children have no (phantom) grandchildren; `THIRD_PARTY_FINANCED.children == [CASH]` (no
  flattening); no descendant hoisted above its call depth.

## Why no code change

`evaluateArtifactRec` builds each node from **its own predicate's result** plus a `children[]` populated **only**
by that node's direct `context.evaluate` calls. Grandchildren are constructed under their parent and never hoisted.
Locality is therefore structural; PE-INV-8 documents and now tests a property the v1.1 implementation already holds.

## Gate (clean worktree)

```
Architecture satisfied            ✓  locality by construction · contract FINAL · nodes pure data
Acceptance scenarios passing       ✓  trace 17/17 incl. 4 PE-INV-8 locality assertions (Law 9/11)
Full E2E sweep                     ✓  47/47 (all prior epics green)
Traceability complete              ✓  PE-INV-8 → Design + EvaluationResult/Artifact contract → Decision Log
No constitutional violations       ✓  no semantic change · Law 9 (invariant now has coverage)
Ready for next epic                ✓  evaluator output FINAL → E3 (Authorization) builds against it
```
**Build gate:** `tsc` 0 · e2e 47/47 · trace 17/17 · unit 73 (unchanged) · `build:isolated` ok.

## State

Branch pushed; **NOT merged** (docs + test only, no migration). Awaiting acceptance → on acceptance, FF-merge →
the evaluator output contract is FINAL → produce `AUTHORIZATION_DECISION_CONTRACT.md` → begin E3 (Authorization).
