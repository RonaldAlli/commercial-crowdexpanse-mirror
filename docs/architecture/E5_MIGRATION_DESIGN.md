# E5 · Migration — Technical Design (ratified w/ refinements; for freeze before implementation)

> Migration reconstructs legacy data into the append-only fact ledger. Its defining principle: **it classifies; it
> never infers.** Two components mirror the rest of the platform — an **immutable `MigrationPlan`** (deterministic,
> reviewable) and a **`MigrationExecution`** (operational). Derives from STM §9c (three-outcome rule), AUTH-INV-9
> (migration principal), GI-3 (evidence never synthesized), and E1 `recordMigrationFact`. Founder-ratified w/
> refinements 2026-07-23.

```
Source (read-only) → MigrationPlan (immutable, reviewable) → MigrationExecution → append-only Truth (ledger)
                                                                              ↘ Review Register (work queue)
```

## 1. Migration invariants (MIG-INV)

- **MIG-INV-1 · Explicit classification only.** Every source datum is classified **exactly once** by explicit
  migration policy into one of three outcomes — `VERIFIED_FACT` | `MIGRATION_ORIGIN` | `REVIEW`. No fourth path, no
  heuristic, no best-guess.
- **MIG-INV-2 · Never manufactures evidence.** Migration may create **historical assertions** (a decision we assert
  existed). It **never** synthesizes an **EVIDENCE** fact. An EVIDENCE-target datum may only be `VERIFIED_FACT` (when
  genuinely verified) or `REVIEW` — never `MIGRATION_ORIGIN` (GI-3).
- **MIG-INV-3 · Observational w.r.t. the source.** Migration only **reads** legacy data; it never edits a source
  system. Reproducible.
- **MIG-INV-4 · Versioned mappings.** The **mapping itself** is versioned (`mappingVersion`), not just the code — so
  a fact can always explain "this exists because Mapping vN classified it this way."
- **MIG-INV-5 · Immutable plans.** A `MigrationPlan` is immutable — reviewable and reproducible before any execution.

## 2. `MigrationIdentity` — first-class deterministic source identity

```
MigrationIdentity = { sourceSystem, sourceObject, sourceRecordId, sourceField, mappingVersion }
```
Its canonical serialization is the **source key** — deterministic replay + idempotency, while `mappingVersion`
allows mapping evolution (MIG-INV-4).

## 3. Versioned `MigrationMapping` (data, not code)

```
MigrationMapping = { mappingId, mappingVersion, rules: MappingRule[] }
MappingRule = {
  match: (datum) → boolean,          // which source data this rule governs
  outcome: "VERIFIED_FACT" | "MIGRATION_ORIGIN" | "REVIEW",   // DECLARED (MIG-INV-1)
  targetFactType?, targetOp?, buildPayload?,  // for VERIFIED_FACT / MIGRATION_ORIGIN
  reviewReason?,                     // for REVIEW
}
```
A rule declaring `MIGRATION_ORIGIN` for an **EVIDENCE** factType is a **mapping error** rejected at plan time
(MIG-INV-2). Mapping is versioned; older versions remain resolvable (MIG-INV-4 / AC-M reproducibility).

## 4. `MigrationPlan` — immutable, reviewable (MIG-INV-5)

`buildPlan(sourceSnapshot, mapping) → MigrationPlan` is a **pure, deterministic** function. For each datum it emits
one immutable `PlanItem { identity, outcome, targetFact? | reviewReason }`. The plan can be reviewed and diffed
before execution; same snapshot + same `mappingVersion` ⇒ identical plan (even if the current mapping is a newer
version — the plan pins its `mappingVersion`, AC-M). No side effects.

## 5. `MigrationExecution` — operational (separated from the plan)

`executePlan(plan, ctx) → MigrationExecutionResult`. Applies each item:
- `VERIFIED_FACT` → `recordFact(...)` with `provenance = VERIFIED`.
- `MIGRATION_ORIGIN` → `recordMigrationFact(...)` (`actorType = MIGRATION_PRINCIPAL`, `provenance = MIGRATION_ORIGIN`).
- `REVIEW` → append to the **Review Register** (never the ledger).

Attribution on every migrated fact: `actorType = MIGRATION_PRINCIPAL`; **`migrationBatchId`** (operational — this
execution) distinct from **`migrationSource`** (where the data originated); `reason` carries the source key.
**Idempotent** — an item whose source key is already present in the ledger is skipped (safe re-run). Execution owns
timing/progress/retries; the *result set* is deterministic. Plan ≠ Execution (mirrors evaluation≠execution,
authorization≠commit).

## 6. Review Register — a work queue, not a subsystem of record

Append-only `MigrationReviewItem { identity, reviewReason, proposedFactType? }`. It is a **work queue**:
`Register → workflow → human → ledger`. **Truth lives only in the ledger.** The register never becomes authoritative.

## 7. Acceptance (AC-*-M*)

Each of the three outcomes produced correctly · a `MIGRATION_ORIGIN` fact is distinguishable by provenance +
`MIGRATION_PRINCIPAL` · **an EVIDENCE-target datum is never migration-synthesized** (→ `REVIEW`, not a fact) ·
idempotent re-run (no duplicates) · review register captures unresolved items · **mapping-version reproducibility**
(re-running an old plan under Mapping v1 reproduces Plan A, not Plan B under Mapping v2).

## 8. Boundaries / prod discipline

Migration reads source, writes only append-only facts + the review queue; it never mutates existing facts, evaluates
predicates, authorizes, or projects. Any migration touching **prod** data is a **separately-authorized operational
step**, never bundled into a merge. `migrate → this design → STM §9c + AUTH-INV-9 + GI-3 + E1 API → Decision Log`.
