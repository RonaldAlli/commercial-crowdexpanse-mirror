# Version 2.0 · Phase 2.0.1 — Acceptance Criteria

> **Status: PENDING FOUNDER APPROVAL FOR IMPLEMENTATION.** These criteria define what
> "done" means for the phase *when it is authorized to build*. They are not yet satisfied and
> nothing has been implemented.
>
> **Companion:** [Implementation Plan](./VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md)
> (D1–D12) · [Schema Proposal](./VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md) ·
> [Test Plan](./VERSION_2_0_PHASE_2_0_1_TEST_PLAN.md) ·
> [Rollout Plan](./VERSION_2_0_PHASE_2_0_1_ROLLOUT_PLAN.md). Frozen V1.3/V1.4 untouched.

Each criterion is written to be **independently verifiable** (unit, E2E, or operational
check). AC IDs are referenced by the Test Plan.

---

## A. Domain spine (must prove — Implementation Plan §0)

| ID | Acceptance criterion | Verified by |
|---|---|---|
| **AC-1** | Every `AutomationJob` and `AutomationExecution` carries a non-null `organizationId`; no read, claim, finalize, or requeue path returns or touches another org's rows. | E2E two-org isolation |
| **AC-2** | Automated activity is attributed to an explicit **Automation Principal** (`principalType = AUTOMATION`, `principalKey` set, `actorId` null, `actorType = AUTOMATION`) — never to a `User`. | Unit + E2E |
| **AC-3** | `AutomationExecution` is **insert-only**: the service exposes no update/delete path; a written execution row is byte-identical when re-read. | Unit (no update API) + E2E (re-read equality) |
| **AC-4** | Job creation is idempotent: two creations with the same `(organizationId, automationType, sourceType, sourceId, policyVersion, occurrenceKey)` yield exactly one job (the second returns the first). | E2E |
| **AC-5** | Execution is idempotent per attempt: `@@unique([automationJobId, attemptNumber])` prevents any double-recorded attempt even under concurrent claim. | E2E (concurrent claim) |
| **AC-6** | A transient failure moves the job `RUNNING → RETRY_SCHEDULED` with `nextAttemptAt` set by exponential backoff; a retryable job is not re-claimed before `nextAttemptAt`. | Unit (lifecycle) + E2E |
| **AC-7** | A permanent failure or exhausted `maxAttempts` moves the job to **`DEAD_LETTERED`**; the failing attempts are each recorded as immutable executions with a `failureClass`. | E2E |
| **AC-8** | Every execution records `policyKey`, `policyVersion`, and `policyDecision`; **no domain read/service is invoked when the decision is `DENY`/`NO_ACTION`/`STALE_CONTEXT`.** | Unit + E2E |
| **AC-9** | Scheduling, queueing, execution, and (would-be) domain mutation are **separate code layers**; the executor is the only component that invokes a domain service on automation's behalf and always evaluates policy first. | Code review + unit |
| **AC-10** | The proof job writes at most one **attributed** `automation.observed` ActivityLog row per run (policy-gated), and the ActivityLog write is post-commit best-effort — a forced ActivityLog failure does **not** fail the job or corrupt the execution ledger. | E2E (fault injection) |
| **AC-11** | A crash mid-attempt (killed executor / expired lease) is recovered by the reaper: the stale `RUNNING` job returns to `RETRY_SCHEDULED` or `DEAD_LETTERED`, and an immutable "abandoned" execution row (`outcome = FAILED`, `failureClass = UNKNOWN`) is recorded. | E2E (simulated lease expiry) |
| **AC-12** | The proof job produces **no** authoritative business effect: `producedDomainEffect = false` on every 2.0.1 execution, and no Closing/Escrow/Financing/Assignment/Underwriting/Opportunity-stage/checklist/waiver/PAID row is created or modified. | E2E (before/after domain snapshot) |
| **AC-13** | No external communication is attempted, no AI/LLM is called, no new provider is required, no calculation is modified. | Code review + dependency check |

---

## B. Architecture-invariant conformance (AU-1…AU-13)

| ID | Acceptance criterion | Invariant |
|---|---|---|
| **AC-14** | Automation owns no authoritative business state; it only reads projections and records its own domain rows. | AU-1 |
| **AC-15** | Automation does not alter, nor become an input to, any underwriting calculation. | AU-2 / lock |
| **AC-16** | Automation does not bypass `UNDERWRITING_APPROVAL`, Closing readiness policy, or the composed PAID gate. | AU (governance) |
| **AC-17** | Automation mutates no immutable snapshot and overwrites no ActivityLog history (append-only, best-effort mirror only). | AU-8 |
| **AC-18** | No cross-organization read or write occurs; org enumeration for scheduling seeds only single-org jobs. | AU (isolation) |
| **AC-19** | The Automation Principal never impersonates a user. | AU-3 |
| **AC-20** | Policy evaluation is mandatory and precedes every domain call; there is no queue→mutation path that skips it. | AU-4 |
| **AC-21** | The immutable `AutomationExecution` ledger complements, never replaces, `ActivityLog` (two-ledger model). | AU-8 / A8 |

---

## C. Quality gates (repository conventions)

| ID | Acceptance criterion | Standard |
|---|---|---|
| **AC-22** | `lib/automation/policy.ts`, `idempotency.ts`, `lifecycle.ts`, `health.ts` are pure (no Prisma/clock/I/O) and added to the `CRITICAL` set, each ≥ **90% branch** coverage; overall ≥ **80%**. | `scripts/run-unit-tests.mjs` |
| **AC-23** | `scripts/e2e-automation.mjs` is auto-discovered by `e2e-all.mjs`, refuses to run outside a `*_test` DB (`assertTestDatabase`), and passes. | `npm test` |
| **AC-24** | `npm run typecheck` passes (note `[...new Set()]` → `Array.from(new Set(...))`). | `tsc --noEmit` |
| **AC-25** | `prisma migrate status` is clean; prod moves **26 → 27** with an additive-only migration; no destructive change; D15 untouched. | `prisma migrate deploy` |
| **AC-26** | RBAC adds exactly one `AUTOMATION` resource + one `MATRIX` row + `canRequeueAutomationJob`; every automation write path is enforced via `authorize()`/`checkAuthorized()`; requeue is ADMIN-only. | Permission unit tests |
| **AC-27** | The additive `ActivityLog` change (`actorType` default `USER`, nullable `automationExecutionId`) causes **zero** behavior change for existing rows, Timeline, notifications, and `/activity`. | E2E regression on existing surfaces |

---

## D. Operational readiness

| ID | Acceptance criterion | Verified by |
|---|---|---|
| **AC-28** | `crowdexpanse-automation` (PM2, fork, `instances: 1`) starts idle-safe: with scheduling disabled it claims nothing and writes nothing; stopping it has **zero** effect on `crowdexpanse-commercial`. | Rollout verification |
| **AC-29** | `GET /api/automation/health` (ADMIN, org-scoped) returns queue depth, oldest-pending age, running/stale/retry/dead-letter counts, success/failure rates, duration stats, policy-denial count, and **org-scope-violation count (must be 0)**. | Operational check |
| **AC-30** | An ADMIN can requeue a `DEAD_LETTERED` job; requeue creates a **new** attempt and **never mutates or deletes any prior execution row**. | E2E |
| **AC-31** | `/api/health` liveness is unchanged; a scheduling kill-switch disables the scheduler without redeploying. | Operational check |

---

## E. Definition of Done (Phase 2.0.1)

All of AC-1…AC-31 pass **and**:
- The four planning determinations that touch existing surfaces (additive `ActivityLog`, one `MATRIX` row, the new PM2 process, the new ADMIN health route) are the *only* changes outside the new `lib/automation/**` tree.
- The [draft acceptance record](../releases/) is written "Pending Founder Acceptance"; the phase is **not** self-accepted. On explicit Founder approval it follows the standard two-step process (this is a **phase** within Version 2.0 — not a version freeze).
- Documentation (dashboard, master plan, roadmap, technical-debt register) is synchronized.

---

*End of Phase 2.0.1 Acceptance Criteria — PENDING FOUNDER APPROVAL FOR IMPLEMENTATION.*
