# E2 · Slice B.4 — Evaluation path locality (PE-INV-10) + glossary Laws · Epic Exit Gate

> Adds **PE-INV-10 · Evaluation path locality** with coverage (Law 9), and the founder-recommended **Architectural
> Laws** section to the glossary. No lib change — locality holds by construction; this slice proves and documents it.
> Branch `feat/opp-pipeline-e2b4-path-locality` off `main` (`37e671a`). 2026-07-22.

## What changed

- **`docs/architecture/PREDICATE_ENGINE_DESIGN.md` + `EVALUATION_RESULT_CONTRACT.md`** — PE-INV-10: the
  cycle-detection `path` exists only within a single evaluation; no cached/thread-local/global carry-over; every
  top-level `evaluate*` starts `path = []`. Enforced by construction (`path` is a threaded function parameter).
- **`scripts/e2e-predicate-cycle.mjs`** — section [5], 2 assertions: evaluating `CYC_B` is identical before and
  after unrelated interleaved evaluations (no carry-over); a fresh evaluation starts clean after prior cyclic runs.
- **`docs/architecture/GLOSSARY.md`** — new **Architectural Laws** section listing Laws 4/6/8/12/13 with one-line
  summaries (fast orientation; full text in the Constitution).

## Why no lib change

`evaluateInternal(predicateId, cbase, path)` receives `path` as a plain parameter, initialized to `[]` at every
public entry. There is no module-level, thread-local, or cached recursion state. Evaluations are therefore
independent by construction; PE-INV-10 documents and now tests a property the v1.1 implementation already holds.

## Gate (clean worktree)

```
Architecture satisfied            ✓  path is a local parameter · evaluations independent · no shared state
Acceptance scenarios passing       ✓  cycle 11/11 incl. 2 PE-INV-10 assertions (Law 9/11)
Full E2E sweep                     ✓  48/48 (all prior epics green)
Traceability complete              ✓  PE-INV-10 → Design + EvaluationResult/Artifact contract → Decision Log
No constitutional violations       ✓  no semantic change · Law 9 (invariant now has coverage)
Ready for next epic                ✓  evaluator subsystem complete → E3 (Authorization)
```
**Build gate:** `tsc` 0 · e2e 48/48 · cycle 11/11 · unit 73 (unchanged) · `build:isolated` ok.

## State

Branch pushed; **NOT merged** (docs + test only, no migration). Awaiting acceptance → on acceptance, FF-merge →
the evaluator subsystem is complete → freeze `AUTHORIZATION_DECISION_CONTRACT.md` → ratify + implement E3.
