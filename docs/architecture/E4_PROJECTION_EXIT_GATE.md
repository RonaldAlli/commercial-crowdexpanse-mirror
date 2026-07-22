# E4 · Projection · Epic Exit Gate

> Implementation of the refined [E4 Projection Design](./E4_PROJECTION_DESIGN.md). Projection **observes active
> Decision Facts** to derive stage (PR-INV-10); `EvaluationArtifact`s are optional supporting explanation.
> Observational + disposable (Law 4/8, PR-INV-1..10). Branch `feat/opp-pipeline-e4-projection` off `main`
> (`4620d18`). Code-only. 2026-07-22.

## What was built (presentation only — observes truth, never re-derives it)

- **`lib/pipeline-projection/types.ts`** — `StageSpine` (stage ↦ Decision Fact type), `FrontierEntry`
  (stage/decisionFactType/present/supportingArtifact), `ProjectionResult` (v1.2 shape), `ProjectionPolicy`,
  `Inconsistency`.
- **`lib/pipeline-projection/spine.ts`** — `ss-1` StageSpine over OWN-4 (each stage bound to its ONE Decision Fact
  type — **no `STAGE:*` evaluator predicates**).
- **`lib/pipeline-projection/project.ts`** — `project({spine, graph, evaluationArtifacts?, projectionPolicy})`:
  observes `graph.activeByType(decisionFactType)` per entry; `stage` = furthest active (PR-INV-8/10); frontier +
  `completeness`; four inconsistencies; indicators from the supporting **result** (not trace, §2a); deterministic
  `projectionId`. No mutation/eval/authorization.
- **`scripts/e2e-pipeline-projection.mjs`** — `AC-OWN1/STM/OPP3` (19 assertions).

## Required refinement (founder) — applied

**Stage projects by observing active Decision Facts, not evaluator predicates.** The spine binds stages to Decision
Fact *types*; projection asks "has this decision been declared (and not retracted)?", never "is it currently
eligible?". No `STAGE:*` predicates were added to the evaluator — the reasoning layer is untouched. `EvaluationArtifact`s
are optional supporting explanation. PR-INV-10 realized: `Predicate → Authorization → Decision Fact → Projection`.

## Coverage

Base LEAD [1] · each stage from its active Decision Fact, furthest wins [2] · regression on retraction [3] ·
missing-predecessor + conflicting-successor (stage still furthest) [4] · retracted-predecessor-surviving-successor
[5] · mutually-exclusive-active [6] · completeness PARTIAL→COMPLETE (stage unchanged) [7] · **decision survives +
evaluation changes ⇒ projection unchanged; NEEDS_REVIEW attention without moving stage** [8] · byte-identical
supporting artifact (PR-INV-7) [9] · deterministic `projectionId` + disposable recompute on change [10].

## Gate (clean worktree)

```
Architecture satisfied            ✓  observes decision facts · stage independent of attention (PR-INV-8/10) · disposable · scope held
Acceptance scenarios passing       ✓  pipeline-projection 19/19 (Law 11)
Full E2E sweep                     ✓  50/50 (E1 · AC-FG · AC-GI2 · trace · cycle · AC-AUTH all green)
Traceability complete              ✓  project → E4 Design → ProjectionResult Contract v1.2 + STM + OWN-1/OWN-4 + EvaluationResult/Artifact → Decision Log
No constitutional violations       ✓  Law 4 (disposable) · Law 8/13 · PR-INV-1..10 · evaluator untouched (no STAGE:* predicates)
Ready for next epic                ✓  E5 Migration / E6 API / E7 UI can consume ProjectionResult
```
**Build gate:** `tsc` 0 · e2e 50/50 · pipeline-projection 19/19 · unit 73 files · `build:isolated` ok.

## Deviations (disclosed)

- **`ss-1` mutual-exclusion example** (`ASSIGNMENT_EXECUTED` × `FINANCING`) is illustrative policy config — the
  mechanism is generic (`projectionPolicy.mutuallyExclusive`); real exclusion sets are added as data.
- **Supporting-artifact-for-underwriting stand-in** — `AC[7]` uses a `DILIGENCE_COMPLETE` artifact as the supporting
  explanation for `UNDERWRITING_APPROVED` (no dedicated underwriting predicate in rs-1); the *completeness mechanism*
  is what is under test, not the artifact's semantics.

## State

Branch pushed; **NOT merged** (code-only, no migration). Awaiting E4 acceptance → on acceptance, FF-merge → E5
(Migration) / E6 (API) / E7 (UI).
