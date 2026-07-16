# Version 2.0 · Phase 2.0.1 — Test Plan

> **Status: FOUNDER APPROVED FOR IMPLEMENTATION** (approved 2026-07-16 · Founder: Ronald Delroy Anthony Allicock). This is the test plan for the approved implementation.
> **No test code, implementation code, schema change, migration, feature branch, or
> production change has been created.** Nothing here runs until the Founder approves the
> phase. All commands below are for the future authorized build.
>
> **Governed by:** [Automation Architecture Lock](./AUTOMATION_ARCHITECTURE_LOCK.md)
> (FOUNDER RATIFIED 2026-07-16, invariants AU-1…AU-13).
>
> **Companion planning documents (this package):**
> [Implementation Plan](./VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md) (D1–D12) ·
> [Schema Proposal](./VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md) ·
> [Acceptance Criteria](./VERSION_2_0_PHASE_2_0_1_ACCEPTANCE_CRITERIA.md) ·
> [Rollout Plan](./VERSION_2_0_PHASE_2_0_1_ROLLOUT_PLAN.md) ·
> [ADRs](./adr/).
>
> **Frozen baselines untouched:** V1.3 (`v1.3.0` / `release/1.3`) and V1.4 (`v1.4.0` /
> `release/1.4`) — their locks, engines, immutable snapshots, lifecycles, and the composed
> PAID gate are exercised only in the *unchanged* existing suites, never modified. D15 is out
> of scope.

---

## 0. Testing strategy & the grounded harness

Phase 2.0.1 follows the platform's established two-tier test convention exactly:

- **Unit tier** — `node scripts/run-unit-tests.mjs` (via `npm run test:unit`). Every *pure*
  automation module is added to the runner's **`CRITICAL`** list and must hold **≥90 % branch**
  coverage; the suite-wide floor is **≥80 % overall branch**. Line coverage stays advisory
  (it mis-maps under `tsx`). Pure modules carry the correctness weight because they contain
  every decision the executor obeys.
- **E2E tier** — `scripts/e2e-automation.mjs`, auto-discovered by `scripts/e2e-all.mjs`, run in
  its own `node_modules/.bin/tsx` child. Like every sibling E2E script it calls
  `assertTestDatabase()` and **refuses to run unless `DATABASE_URL` targets a `*_test`
  database**. It builds two throwaway organizations (`-${process.pid}-a` / `-b` slugs),
  exercises the full lifecycle against real Postgres (real `SELECT … FOR UPDATE SKIP LOCKED`
  claiming), and cascade-cleans at the end.
- **No Playwright** is required for 2.0.1 — the phase ships no user-facing UI (only an ADMIN
  JSON ops read). The port-3199 `_test`-DB visual harness remains available but is out of
  scope here.

**Safety gate (non-negotiable):** the E2E harness will not touch a non-`_test` database, and
**no test may run against production**. There are no artificial production transactions and
no Playwright fixture mutation against prod (standing constraints).

---

## 1. Test inventory

### 1.1 Unit tests → the four CRITICAL pure modules

| Test file | Module under test (added to `CRITICAL`) | Core assertions |
|---|---|---|
| `tests/unit/automation/policy.test.ts` | `lib/automation/policy.ts` | `evaluatePolicy(context)` returns the correct `AutomationDecision` for every branch; `POLICY_VERSION` is stamped; purity (no I/O). |
| `tests/unit/automation/idempotency.test.ts` | `lib/automation/idempotency.ts` | Canonical idempotency key construction; `contextFingerprint` determinism + sensitivity; `occurrenceKey` bucketing. |
| `tests/unit/automation/lifecycle.test.ts` | `lib/automation/lifecycle.ts` | Legal vs illegal state transitions; `failureClass → disposition`; exponential-backoff computation. |
| `tests/unit/automation/health.test.ts` | `lib/automation/health.ts` | Health-projection math over sample job/execution arrays. |

Each module is **pure** (plain data in, plain data out — no Prisma, no clock, no network),
mirroring `lib/permissions.ts` / `lib/closing.ts`, so it is directly unit-testable and
gate-eligible. `scripts/run-unit-tests.mjs` is amended (additively) to include the four paths
in `CRITICAL`.

### 1.2 E2E test → one behavioral script

| Script | Harness | Scope |
|---|---|---|
| `scripts/e2e-automation.mjs` | auto-discovered by `e2e-all.mjs`; `assertTestDatabase`; two orgs `a`/`b` | Full job lifecycle, retry, dead-letter, crash recovery, idempotency, attempt-uniqueness, supersession, ADMIN requeue, concurrency, and cross-org isolation against real Postgres. |

---

## 2. Unit-test detail

### 2.1 `policy.test.ts` — decisions as pure-function cases
Table-driven over `evaluatePolicy(context)`:
- **`ALLOW`** — a well-formed, in-flight, org-consistent context for the read-only proof job.
- **`DENY`** — a context whose principal lacks the required `AUTOMATION` `READ` capability, or that violates a policy precondition; asserts a non-empty `reason`.
- **`REQUIRE_APPROVAL`** — reserved path: asserts the decision *shape* is reachable and carries a `reason`, while confirming the 2.0.1 proof job **never** produces it (the read-only observer has no approval-gated action).
- **`NO_ACTION`** — nothing to observe (e.g. no in-flight opportunities) → a clean `NOOP` downstream.
- **`STALE_CONTEXT`** — the observed context fingerprint no longer matches the source → do not act on stale data.
- **Purity / version** — same input yields same decision across repeated calls; `POLICY_VERSION` is a stable integer surfaced for stamping.

### 2.2 `idempotency.test.ts` — key construction & fingerprint determinism
- **Canonical key** — building the compound key from `(organizationId, automationType, sourceType, sourceId, policyVersion, occurrenceKey)` is order-independent and stable; changing any component changes the key; a `policyVersion` bump yields a **new** key (forcing re-evaluation, never a silent replay).
- **`contextFingerprint`** — a SHA-256 over the *canonicalized* (sorted-key) context is deterministic for equal content, differs for any content change, and is insensitive to key ordering (mirrors the RefreshJob `contentHash` precedent).
- **`occurrenceKey`** — the schedule bucket (e.g. `YYYY-MM-DDTHH`) is stable within a bucket and rolls at the boundary, making periodic runs idempotent by construction.

### 2.3 `lifecycle.test.ts` — transitions, dispositions, backoff
- **Legal transitions** — `PENDING→QUEUED→RUNNING→SUCCEEDED`; `RUNNING→RETRY_SCHEDULED→QUEUED`; `RUNNING→DEAD_LETTERED`; `{PENDING,QUEUED,RETRY_SCHEDULED}→CANCELLED`; `→SUPERSEDED`.
- **Illegal transitions rejected** — no transition *out of* a terminal state (`SUCCEEDED`/`DEAD_LETTERED`/`CANCELLED`/`SUPERSEDED`); no `RUNNING→SUCCEEDED` without a recorded attempt; no force-cancel of `RUNNING` in 2.0.1.
- **`failureClass → disposition`** — every `AutomationFailureClass` maps to the disposition in Implementation Plan §9: retryable classes (`TRANSIENT_INFRASTRUCTURE`, `DATABASE_CONTENTION`, `DEPENDENCY_UNAVAILABLE`, bounded `UNKNOWN`) → `RETRY_SCHEDULED` until `attempts ≥ maxAttempts` → `DEAD_LETTERED`; permanent classes (`VALIDATION_FAILURE`, `PERMISSION_FAILURE`, `ORG_SCOPE_VIOLATION`, `INVARIANT_VIOLATION`) → immediate `DEAD_LETTERED`; `POLICY_DENIED`/`STALE_CONTEXT` → terminal `NOOP`/denied disposition (no retry); `ORG_SCOPE_VIOLATION`/`PERMISSION_FAILURE`/`INVARIANT_VIOLATION` flagged alert-always and never retried.
- **Exponential backoff** — `nextAttemptAt = now + min(BACKOFF_CAP, BACKOFF_BASE · 2^attempt)`; monotonic increase, capped, computed as a pure function of `(attempt, now)`.

### 2.4 `health.test.ts` — projection math
Over sample `AutomationJob[]` + `AutomationExecution[]` arrays, assert the pure projection
computes: queue depth (`PENDING`+`QUEUED`), oldest-pending age, running count, **stale**
(lease-expired `RUNNING`) count, `RETRY_SCHEDULED` count, **dead-letter count**,
success/failure rates over a window, execution duration avg/p95, policy-denial count, and
**org-scope-violation count** — with empty-input and single-row edge cases.

---

## 3. E2E scenarios (`scripts/e2e-automation.mjs`)

All scenarios build two orgs (`a`, `b`), seed org-scoped fixtures, and drive the real
services (`lib/automation/job-service.ts`, `executor.ts`, `scheduler.ts`, `reaper.ts`).

1. **Full lifecycle** — scheduler seeds a `PENDING` job → `QUEUED` → executor claims (`RUNNING`, lease set) → proof observer reads the closing projection → finalize writes an immutable `AutomationExecution` (`outcome=SUCCEEDED`/`NOOP`) and sets job `SUCCEEDED`. Assert exactly one execution row, `producedDomainEffect=false`, and a best-effort attributed `automation.observed` ActivityLog row linked via `activityLogId` (when policy-gated on).
2. **Retry path** — inject a transient failure on attempt 1 → execution `outcome=FAILED`, `failureClass=TRANSIENT_INFRASTRUCTURE`, job `RETRY_SCHEDULED` with a future `nextAttemptAt`; advance eligibility → re-`QUEUED` → attempt 2 `SUCCEEDED`. Assert two immutable execution rows, distinct `attemptNumber`s.
3. **Dead-letter path** — a permanent failure (or exhausted `maxAttempts`) → job `DEAD_LETTERED`; assert one execution row per attempt, none mutated, and the job is terminal.
4. **Crash recovery** — simulate a stale `RUNNING` lease (`leaseExpiresAt < now`, no finalize) → reaper transitions to `RETRY_SCHEDULED` (attempts remain) or `DEAD_LETTERED` (exhausted) **and writes an abandoned execution row** (`outcome=FAILED`, `failureClass=UNKNOWN`). Assert the ledger stays complete and no job is stuck `RUNNING`.
5. **Idempotent creation** — calling create twice with the same canonical key yields **one** job (read-check-then-create); the second call returns the existing row, not a duplicate.
6. **Execution-attempt uniqueness** — attempting to record two executions with the same `(automationJobId, attemptNumber)` violates `@@unique` and is rejected.
7. **Supersession** — the scheduler creating a newer occurrence for the same `(org, type, source)` while an older non-terminal job exists transitions the older job to `SUPERSEDED`; the newer job proceeds.
8. **ADMIN-only requeue** — `canRequeueAutomationJob(ADMIN)` requeues a `DEAD_LETTERED` job by creating a **new** attempt (`RETRY_SCHEDULED→QUEUED`); assert **no prior execution row is mutated or deleted**, and a non-ADMIN role is refused.
9. **Cross-org isolation** (mirrors `scripts/e2e-closing.mjs:160-163`):
   ```
   [N] Org scoping — an automation job/execution is invisible and unwritable across orgs:
   assert (await getAutomationJob(b.id, jobA.id)) === null            // org B cannot read org A's job
   assert (await listExecutions(b.id, jobA.id)).length === 0          // …nor its executions
   await throws(() => claimForOrg(b.id, jobA.id))                     // …nor claim it
   await throws(() => finalizeForOrg(b.id, execA))                    // …nor finalize it
   await throws(() => requeueJob(b.id, jobA.id, adminB.id))           // …nor requeue it
   ```
   Also assert the executor, while running org A's job, issues **no** query that returns org B data, and the scheduler's org enumeration seeds strictly single-org jobs.

---

## 4. Concurrency test

Within `scripts/e2e-automation.mjs`, seed N `QUEUED` jobs and drive **two concurrent claim
loops** against the same table. Assert:
- `SELECT … FOR UPDATE SKIP LOCKED` gives each job to **exactly one** claimer (no job runs twice);
- no claimer blocks on the other (skip-locked, not lock-wait);
- total executions == total jobs, each with `attemptNumber = 1`;
- no `@@unique([automationJobId, attemptNumber])` violation occurs under contention.

---

## 5. Negative / invariant tests

- **No domain effect** — after any proof-job run, `producedDomainEffect` is `false` on every execution, and **no** `ClosingChecklist(Item)`, `EscrowRecord`/`EscrowEvent`, `FinancingRecord`, `AssignmentRecord`, `Opportunity.stage`, waiver, or PAID state was created or changed (assert counts/values unchanged before/after). (AU-1; standing V2.0 rules.)
- **No external transport** — the proof job invokes no email/SMS/HTTP transport (there is none in the automation path); assert no `EmailMessage` row is created by an automation run.
- **No AI, no calculation change** — no LLM call is made; `lib/analysis.ts` and all underwriting outputs are byte-for-byte unchanged.
- **Immutable ledger** — the job-service exposes **no update path** for `AutomationExecution`; a test confirms the service surface has only insert + read for executions, and that a direct attempt to update an execution is not part of any service (guarded by review + the absence of an update method).
- **Policy is unbypassable** — a test that drives the executor with a `DENY`/`NO_ACTION` policy asserts the domain read/observation is short-circuited and recorded, with no downstream effect.

---

## 6. Migration & regression

- **Migration status** — after `prisma migrate dev` locally, `prisma migrate status` reports clean (no drift); the additive migration takes the `_test` DB to **27**.
- **ActivityLog additive columns are inert for existing reads** — seed pre-existing (human) ActivityLog rows, apply the migration, and assert every existing row reads back with `actorType = USER` and `automationExecutionId = null`; the Timeline / notifications / `/activity` projections return identical results before and after (defaults preserve behavior; no backfill needed).
- **Existing suite still green** — the full pre-existing E2E suite (`npm run test`) and unit suite (`npm run test:unit`) pass unchanged; the new automation script only adds coverage, never alters a sibling.
- **Frozen baselines** — no test modifies or re-runs against `release/1.3` / `release/1.4`; frozen behavior is verified only through the unchanged existing suites on `main`.

---

## 7. How to run (future authorized build)

Against the dedicated `*_test` database only:

```bash
# unit tier (CRITICAL ≥90% branch, overall ≥80%)
npm run test:unit                 # → node scripts/run-unit-tests.mjs

# full E2E suite incl. the new automation script (refuses non-*_test DB)
npm run test                      # → node --env-file-if-exists=.env.test scripts/e2e-all.mjs

# just the automation E2E during development
node --env-file-if-exists=.env.test --import tsx scripts/e2e-automation.mjs

# combined CI gate
npm run test:ci                   # → typecheck && test:unit && test
```

**Safety gate:** `e2e-all.mjs` and each script call `assertTestDatabase()` and abort unless
`DATABASE_URL` ends in a `*_test` database. **No test runs against production; no artificial
production data is created.**

---

## 8. Exit criteria (test-side)

- All four CRITICAL automation modules ≥90 % branch; overall ≥80 %.
- `scripts/e2e-automation.mjs` green for every scenario in §3–§5, including cross-org isolation and concurrency.
- `prisma migrate status` clean; existing unit + E2E suites unchanged and green.
- Zero domain-state mutation and zero external transport observed across all runs.

Formal pass/fail wiring of these into the phase's Definition of Done lives in the
[Acceptance Criteria](./VERSION_2_0_PHASE_2_0_1_ACCEPTANCE_CRITERIA.md).

---

*End of Phase 2.0.1 Test Plan — FOUNDER APPROVED FOR IMPLEMENTATION.*
