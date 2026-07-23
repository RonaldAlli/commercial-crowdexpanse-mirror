# E6 · API · Epic Exit Gate

> Implementation of the [E6 API Design](./E6_API_DESIGN.md). A transport/orchestration `Coordinator` over the
> canonical subsystems (API-INV-1); transaction-scoped, race-safe commit (API-INV-2); no pre-commit mutation
> (API-INV-3); transport idempotency. Branch `feat/opp-pipeline-e6-api` off `main` (`6dcb12a`). Code-only. 2026-07-23.

## What was built (orchestration only — no business logic)

- **Additive tx-client threading (API-INV-2):** E1 `recordFact` / `recordMigrationFact` / `reconstructHistory` and
  E2·A `buildFactGraph` now take an **optional** `db`/`client` (default global `prisma`) — backward-compatible; all
  prior suites green.
- **`lib/pipeline-api/coordinator.ts`** — `perform(request)`: pre-check (no lock/write, API-INV-3) → **one
  `$transaction`**: per-opportunity `pg_advisory_xact_lock` → fresh `buildFactGraph(tx)` → `evaluateArtifact` →
  `authorize` → optimistic sequence/decisionId guard → `recordFact(tx)` → transport-idempotency record (the fact's
  `reason`) → **post-commit** `project`. Translates outcomes to `COMMITTED` / `DENIED` / `STALE`.
- **`lib/pipeline-api/errors.ts`** — deny/stale → the six frozen categories, preserving `subsystemCode` +
  `subsystemOutcome` + `httpStatus` + embedded `AuthorizationDecision` (no lossy translation).
- **`lib/pipeline-api/types.ts`** — `FactOperationRequest/Response` (incl. `requestId`, `committedGlobalSequence`,
  `projectedThroughGlobalSequence`, `ContractVersions`), `ApiError`.
- **`scripts/e2e-pipeline-api.mjs`** — `AC-API-*` (14 assertions).

## Invariants → coverage

| Item | AC |
|---|---|
| COMMITTED + response sequence boundaries (`projectedThrough ≥ committed`) + version stamps | [1] |
| DENIED business-precondition → 422, subsystemCode, decision AS-IS, no append | [2] |
| DENIED authorization → 403 INSUFFICIENT_CAPABILITY | [3] |
| STALE (sequence advanced) → 409 STALE_FACT_GRAPH, no append | [4] |
| transaction rollback + **tx-context enforcement** (API-INV-2 — append rolled back ⇒ ran on tx, not global) | [5] |
| transport idempotency (same requestId ⇒ one fact) | [6] |
| concurrent competing commits ⇒ exactly one COMMITTED, one STALE | [7] |

## Gate (clean worktree)

```
Architecture satisfied            ✓  Coordinator delegates + translates (API-INV-1) · tx-scoped commit (API-INV-2) · no pre-commit mutation (API-INV-3) · advisory lock + sequence guard
Acceptance scenarios passing       ✓  AC-API 14/14 (Law 11)
Full E2E sweep                     ✓  52/52 (E1 · AC-FG · AC-GI2 · trace · cycle · AC-AUTH · projection · migration all green under the additive tx-client threading)
Traceability complete              ✓  Coordinator → E6 Design → API/Error Contracts + E1/FactGraph/Evaluation/Authorization/Projection → Decision Log
No constitutional violations       ✓  no business logic in API · one evaluator/graph/authz reused · GI-1 append-only
Ready for next epic                ✓  E7 (UI) can consume FactOperationResponse / ProjectionResult; HTTP routes are thin adapters over perform()
```
**Build gate:** `tsc` 0 · e2e 52/52 · AC-API 14/14 · unit 73 files · `build:isolated` ok.

## Deviations (disclosed)

- **Additive tx-client parameters on E1/E2·A** (backward-compatible; required by API-INV-2). Documented as a v1.x
  additive extension of those frozen APIs.
- **Idempotency is ledger-native** — the committed fact's `reason = "API:req:"+requestId` is the idempotency record
  (no new table/migration); a retry finds the fact under the advisory lock and replays. `responseDigest` is not
  stored; the replay rebuilds an equivalent COMMITTED response (the committed fact is identical; projection is
  disposable).
- **Concurrency = advisory lock + optimistic `expectedGlobalSequence`** (the design's primary mechanism);
  SERIALIZABLE-with-retry remains the documented alternative if ever needed.
- **HTTP routes not included** — acceptance targets the deterministic Coordinator; the Next.js `app/api/...` adapters
  are a thin follow-on.

## State

Branch pushed; **NOT merged** (code-only, no migration). Awaiting E6 acceptance → on acceptance, FF-merge → E7 (UI)
+ the thin HTTP route adapters.
