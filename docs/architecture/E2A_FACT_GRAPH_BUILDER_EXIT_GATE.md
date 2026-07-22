# E2 · Slice A — Fact Graph Builder · Epic Exit Gate

> Implementation of the ratified [Fact Graph Contract](./FACT_GRAPH_CONTRACT.md) (Law 12). Pure derivation — no
> new semantics. Branch `feat/opp-pipeline-e2a-fact-graph` off `main` (`a508023`). 2026-07-22.

## What was built (interpretation only — no eval/projection/authz/mutation)

- **`lib/pipeline-facts/fact-graph.ts`** — the single Fact Graph Builder. `buildFactGraph(request)` consumes ONLY
  the frozen E1 v1.0 API (`reconstructHistory`) and returns an immutable first-class `FactGraph`. Owns the one
  implementation of reconstruction / supersession resolution / active-fact calc / collection aggregation / version
  resolution. Surface: `history`, `activeFacts`, `activeByType`, `byFactType`, `byChain`, `collection`,
  `provenance`, `versionContext`, `isActive`, `assertInvariant`. Types `VersionContext`, `FactGraphRequest`,
  `CollectionView`, `ChainView`; explicit `STRUCTURAL_CONTEXT`.
- **`lib/pipeline-facts/service.ts`** — `activeFacts()` is now a thin **compatibility façade** delegating to
  `buildFactGraph(...).activeFacts` (v1.1, non-breaking). One active-fact calculation (Law 12).
- **`lib/pipeline-facts/index.ts`** — barrel re-exports the Builder.
- **`scripts/e2e-fact-graph.mjs`** — `AC-FG-*` acceptance suite (25 assertions), auto-discovered by `e2e-all`.

## Invariant → acceptance coverage

| Invariant | Meaning | AC-FG scenario |
|---|---|---|
| FG-INV-1/9 | one reconstruction, ledger-only, authoritative order | [1] |
| FG-INV-2 | one supersession resolution (active/asserted) | [2] |
| FG-INV-3 | one active-fact calculation; corrected member exposed | [3] |
| FG-INV-4 | one collection aggregation; withdrawal removes a key | [4] |
| FG-INV-5 | version resolution (accepted artifactVersion) + context stamped | [5] |
| FG-INV-10 | retracted = absent-for-decision yet present in history | [6] |
| (regression) | later unrelated fact never alters earlier chain resolution | [7] |
| FG-INV (migration) | MIGRATION_ORIGIN interpreted identically, provenance reported | [8] |
| FG-INV-6/8 | immutable graph; consumers cannot mutate; assertInvariant | [9] |
| FG-INV-7 | reproducible — same request ⇒ identical graph | [10] |
| Law 12 | `activeFacts()` façade equals `graph.activeFacts` | [11] |

## Gate (clean worktree `/opt/crowdexpanse/wt-roadmap`)

```
Architecture satisfied            ✓  single Builder · ledger-only input · immutable first-class FactGraph · scope held (no eval/projection/authz/mutation)
Acceptance scenarios passing       ✓  AC-FG 25/25 (Law 11)  — scripts/e2e-fact-graph.mjs
Full E2E sweep                     ✓  45/45 scripts (E1 e2e-pipeline-facts still green under the façade change)
Traceability complete              ✓  Builder → Fact Graph Contract → Spec (GI-1/GI-2, fact families) → Decision Log
No constitutional violations       ✓  Law 6 untouched · Law 8 observational · Law 12 one Builder + one active calc · semantics unchanged
Ready for next epic                ✓  E2 Slice B (Predicate Engine) can consume the FactGraph
```
**Build gate:** `tsc` 0 · e2e 45/45 · AC-FG 25/25 · unit 73 files · `build:isolated` ok.

## Deviations / decisions beyond the ratified design (disclosed)

- **`activeFacts()` delegates via a dynamic `import("./fact-graph")`** inside the function body — avoids a static
  service↔fact-graph import cycle while keeping the single implementation in the Builder. Behavior unchanged.
- **`STRUCTURAL_CONTEXT` sentinel** used by the façade: active-fact determination is version-independent, so the
  façade builds under an explicit named structural context (not an implicit default) — consistent with the
  contract's "nothing implicit" rule.
- **Decision semantics of the active set:** `graph.activeFacts` returns unsuperseded rows **including** RETRACT/
  INVALIDATE tips (preserves E1 `activeFacts` behavior exactly), while `activeByType`/`collection` treat those tips
  as *absent-for-decision*. Structural active set ≠ asserted-for-decision — both are exposed, by design.

## State

Branch pushed; **NOT merged to main** (no migration — this slice is code-only). Awaiting Slice A acceptance → on
acceptance, FF-merge → E2 Slice B (Predicate Engine).
