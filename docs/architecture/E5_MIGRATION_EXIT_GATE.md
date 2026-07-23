# E5 · Migration · Epic Exit Gate

> Implementation of the [E5 Migration Design](./E5_MIGRATION_DESIGN.md). Classify never infer; immutable
> deterministic `MigrationPlan` vs operational `MigrationExecution`; never manufactures evidence (MIG-INV-1..5).
> Branch `feat/opp-pipeline-e5-migration` off `main` (`854501f`). Code-only. 2026-07-23.

## What was built

- **`lib/pipeline-migration/types.ts`** — `MigrationIdentity` (deterministic source key), `SourceDatum`,
  versioned `MigrationMapping` / `MappingRule`, immutable `MigrationPlan` / `PlanItem`, `MigrationReviewItem`,
  `MigrationExecutionResult`.
- **`lib/pipeline-migration/mapping.ts`** — versioned mapping registry (`mapping-v1`, `mapping-v2`); each rule
  **declares** its outcome (MIG-INV-1).
- **`lib/pipeline-migration/plan.ts`** — `buildPlan(source, mapping)`: pure, deterministic, **frozen** plan
  (MIG-INV-5); no source mutation (MIG-INV-3); enforces **MIG-INV-2** (an EVIDENCE-target `MIGRATION_ORIGIN` rule is
  rejected at plan time → `REVIEW` + `planError`).
- **`lib/pipeline-migration/execute.ts`** — `executePlan(plan, ctx)`: `VERIFIED_FACT`→`recordFact` (VERIFIED),
  `MIGRATION_ORIGIN`→`recordMigrationFact` (MIGRATION_PRINCIPAL / MIGRATION_ORIGIN), `REVIEW`→review queue;
  attribution `migrationBatchId` (operational) vs `migrationSource` (origin); **idempotent** by source key.
- **`scripts/e2e-pipeline-migration.mjs`** — `AC-*-M*` (15 assertions).

## Invariants → coverage

| Invariant | AC |
|---|---|
| MIG-INV-1 · explicit three-outcome classification | [1] |
| MIG-INV-2 · never manufactures evidence (evidence→REVIEW, not MIGRATION_ORIGIN) | [4] |
| MIG-INV-3 · observational w.r.t. source | [7] |
| MIG-INV-4 · versioned mappings (v1≠v2; old plan reproduces) | [6] |
| MIG-INV-5 · immutable deterministic plans | [6] |
| provenance attribution (MIGRATION_PRINCIPAL / MIGRATION_ORIGIN vs VERIFIED) | [3] |
| idempotent execution (no duplicates) | [5] |
| review register = work queue | [2],[8] |

## Gate (clean worktree)

```
Architecture satisfied            ✓  classify-not-infer · Plan(immutable/deterministic) vs Execution(operational) · never manufactures evidence · scope held
Acceptance scenarios passing       ✓  migration 15/15 (Law 11)
Full E2E sweep                     ✓  51/51 (all prior epics green)
Traceability complete              ✓  migrate → E5 Design → STM §9c + AUTH-INV-9 + GI-3 + E1 API → Decision Log
No constitutional violations       ✓  GI-1 (append-only) · GI-3 (evidence never synthesized) · MIG-INV-1..5
Ready for next epic                ✓  E6 (API + commit wiring) / E7 (UI)
```
**Build gate:** `tsc` 0 · e2e 51/51 · migration 15/15 · unit 73 files · `build:isolated` ok.

## Deviations (disclosed)

- **Idempotency uses `reason = "MIG:"+sourceKey` + a targeted lookup** in the execution layer (operational dedup) —
  not a schema change. Execution is the operational component; the *result set* stays deterministic.
- **`MIG-INV-2` handling routes to REVIEW with a `planError`** rather than throwing — the plan still builds and is
  fully reviewable (MIG-INV-5), and no evidence is ever synthesized. The mapping error is surfaced explicitly.

## State

Branch pushed; **NOT merged** (code-only, no migration of prod data). Awaiting E5 acceptance → on acceptance,
FF-merge. **Any migration touching prod data is a separately-authorized operational step, never bundled into a
merge.**
