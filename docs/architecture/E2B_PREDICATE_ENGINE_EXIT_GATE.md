# E2 · Slice B — Predicate Engine · Epic Exit Gate

> Implementation of the ratified [Predicate Engine Design](./PREDICATE_ENGINE_DESIGN.md). Pure derivation — no new
> business semantics. Branch `feat/opp-pipeline-e2b-predicate-engine` off `main` (`7a9c1e2`). 2026-07-22.

## What was built (evaluation only — no projection/authz/mutation/ledger reads)

- **`lib/pipeline-predicates/types.ts`** — `EvaluationContext` `{graph, ruleSetVersion, policyVersion, registry,
  evaluate}`, `EvaluationResult` (with `evaluationId` + `determinismStamp`), `Predicate`, `PredicateOutcome`,
  `PredicateRegistry`, `Reason`.
- **`lib/pipeline-predicates/evaluator.ts`** — the single `evaluate(predicateId, context)` + `makeContext` +
  `evaluatePredicate`. `evaluationId` = deterministic content hash of `(predicateId, ruleSetVersion, policyVersion,
  graph fingerprint)`. Determinism surface = FactGraph + ruleSetVersion only. Fail-closed (unknown/throwing
  predicate ⇒ `satisfied:false`, never throws).
- **`lib/pipeline-predicates/registry.ts`** — versioned `(predicateId, ruleSetVersion) → Predicate`.
- **`lib/pipeline-predicates/predicates/rs-1.ts`** — the ratified first set: `DILIGENCE_COMPLETE`, `CLEAR_TO_CLOSE`,
  `TRANSACTION_CLOSED.{CASH, THIRD_PARTY_FINANCED, ASSIGNMENT}`. Composition via `ctx.evaluate` only (PE-INV-1).
- **`scripts/e2e-predicate-engine.mjs`** — `AC-GI2-*` suite (21 assertions), auto-discovered by `e2e-all`.
- **`lib/pipeline-facts/fact-graph.ts`** — v1.1 additive `activeAssertedByType(factType)` (multi-instance
  decision-visible accessor; needed for `FUNDS_DISBURSED` by purpose). Backward-compatible; AC-FG still 25/25.

## Invariant / matrix → acceptance coverage

Per predicate: **positive · negative · missing-evidence · wrong-version · regression · migration** (§ AC-GI2 [1]).
Engine: **PE-INV-1** isolation (composition only via `ctx.evaluate` — [2] factsRelied merge), **PE-INV-2**
referential transparency (evaluate(X)==evaluate(X) incl. `evaluationId` — [6]), **PE-INV-3** graph-only (Law 13; no
ledger reads by construction — predicates receive only the context), **PE-INV-4** evaluation-only, determinism
surface + fail-closed ([6]), decision-visibility on retraction ([3]).

## Gate (clean worktree `/opt/crowdexpanse/wt-roadmap`)

```
Architecture satisfied            ✓  one evaluator · EvaluationContext · graph-only · pure/deterministic · scope held
Acceptance scenarios passing       ✓  AC-GI2 21/21 (Law 11)  — scripts/e2e-predicate-engine.mjs
Full E2E sweep                     ✓  46/46 scripts (E1 + AC-FG 25/25 still green under the FactGraph v1.1 add)
Traceability complete              ✓  Predicate Engine → Design → Fact Graph Public API + Spec (GI-2, OWN-3, 5A/5B) → Decision Log
No constitutional violations       ✓  Law 6 one evaluator · Law 8 observational · Law 13 graph-only · semantics unchanged · projection NOT here (E4)
Ready for next epic                ✓  E3 (Authorization) can consume the evaluator; E4 (Projection) can consume predicate results
```
**Build gate:** `tsc` 0 · e2e 46/46 · AC-GI2 21/21 · unit 73 files · `build:isolated` ok.

## Deviations / decisions beyond the ratified design (disclosed)

- **FactGraph v1.1 additive `activeAssertedByType`.** `FUNDS_DISBURSED` is a non-collection evidence fact that
  legitimately has multiple asserted instances (distinct purposes); a single `activeByType` singleton is
  insufficient. Per **FG-INV-12** (extend the Builder, never query around it), I added a decision-visible
  multi-instance accessor to the graph rather than filter in the predicate. Additive, non-breaking; AC-FG 25/25
  unchanged. Recorded in `FACT_GRAPH_PUBLIC_API.md` (v1.1).
- **`rs-1` policy constants** (required diligence materials / contingencies / financing states) are illustrative and
  embedded in the versioned predicate implementation, per the design's "the versioned predicate IS the policy."
  Real org rule-sets are added as new versions — never an ad-hoc change to `rs-1`.

## State

Branch pushed; **NOT merged to main** (code-only, no migration). Awaiting Slice B acceptance → on acceptance,
FF-merge → E3 (Authorization).
