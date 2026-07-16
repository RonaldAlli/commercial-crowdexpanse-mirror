# Version 2.0 · Phase 2.0.1 — Automation Foundation, Job Execution & Audit
## Repository-Grounded Implementation Plan

> **Status: PENDING FOUNDER APPROVAL FOR IMPLEMENTATION.** This is a planning document
> only. **No implementation code, no Prisma schema change, no migration, no feature branch,
> no production change, no new package, no worker/queue/scheduler/service/policy/UI** has been
> created. Nothing here is authorized to build until the Founder approves this package.
>
> **Governed by:** [Automation Architecture Lock](./AUTOMATION_ARCHITECTURE_LOCK.md)
> (FOUNDER RATIFIED 2026-07-16, invariants AU-1…AU-13), the [Version 2.0 Decision
> Package](./VERSION_2_0_DECISION_PACKAGE.md), the [Discovery Report](./VERSION_2_0_DISCOVERY.md),
> and the [Platform Architecture Map](./PLATFORM_ARCHITECTURE_MAP.md) §6.
>
> **Frozen baselines untouched:** V1.3 (`v1.3.0` / `release/1.3`) and V1.4 (`v1.4.0` /
> `release/1.4`) — their locks, engines, immutable snapshots, lifecycles, and the composed
> PAID gate are not modified by anything proposed here. D15 (DealAnalysis removal) is out of
> scope.
>
> **Companion planning documents (this package):**
> [Schema Proposal](./VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md) ·
> [Acceptance Criteria](./VERSION_2_0_PHASE_2_0_1_ACCEPTANCE_CRITERIA.md) ·
> [Test Plan](./VERSION_2_0_PHASE_2_0_1_TEST_PLAN.md) ·
> [Rollout Plan](./VERSION_2_0_PHASE_2_0_1_ROLLOUT_PLAN.md) ·
> [ADRs](./adr/).

---

## 0. Purpose & non-goals

Phase 2.0.1 establishes the **Automation domain spine** — the smallest production-safe
infrastructure that proves organization-scoped, policy-governed, idempotent, retryable,
crash-recoverable job execution with an immutable audit ledger — **before** any reminder,
communication, AI, or domain-mutating capability is allowed to depend on it.

The phase proves, end to end, with **one harmless internal proof job** and no authoritative
domain effect:

| # | Property the phase must prove | Primary mechanism |
|---|---|---|
| 1 | Organization-scoped job execution | `organizationId` required on both models; every claim/query org-scoped |
| 2 | Explicit Automation Principal attribution | `AutomationPrincipal` (type `AUTOMATION`) + additive `ActivityLog.actorType` |
| 3 | Immutable execution history | `AutomationExecution` insert-only ledger (A8) |
| 4 | Idempotent job creation and execution | compound `@@unique` request key + attempt uniqueness |
| 5 | Retryable execution with classified failures | `failureClass` enum + `nextAttemptAt` backoff |
| 6 | Dead-letter handling | job status `DEAD_LETTERED` + operator requeue |
| 7 | Mandatory policy evaluation | pure `evaluatePolicy()` gate, executor-enforced (AU-4) |
| 8 | Separation of scheduling, queueing, execution, mutation | four code layers (A2) |
| 9 | ActivityLog linkage without replacing ActivityLog | best-effort post-commit attributed write |
| 10 | Safe recovery from crashes / partial execution | lease + reaper reconciliation |
| 11 | No direct ownership of authoritative business state | proof job is read-only (AU-1) |
| 12 | No external communication · no AI · no autonomous domain mutation | scope constraint below |

**Non-goals (explicitly deferred):** AI/LLM anything; SMS/email/outbound comms; reminders;
domain-state mutation by automation; an external broker (Redis/Bull); a full ops dashboard
UI; the `AutomationProposal`/`AutomationAction` first-class models; DB-backed configurable
policies; event-driven (transactional-outbox) triggering of automation from domain writes.
Each has a designated later phase (§13).

---

## 1. Repository evidence base (what this plan is grounded in)

Re-inspected directly from source (not from the discovery inventory). Every determination
below traces to one of these precedents.

### 1.1 Job precedent — `RefreshJob` (`lib/intelligence/refresh.ts`, `prisma/schema.prisma:386-416`)
- Durable one-row-per-run record; idempotency anchor **`@@unique([organizationId, sourceKey, requestKey])`**; secondary **`@@index([organizationId, status])`**.
- `RefreshJobStatus { PENDING, RUNNING, SUCCEEDED, FAILED, NOOP }` — **`PENDING` already exists but is unused, explicitly "reserved for the scheduled engine (Slice 6)"** (`schema.prisma:228-229`).
- `runRefresh()` = **read-check-then-create** on the compound unique (`findUnique` → return existing → else `create`), NOT upsert, NOT constraint-catch (`refresh.ts:85-110`).
- **The job row brackets a `prisma.$transaction`**: created `RUNNING` *before* the tx; terminal update (`SUCCEEDED`/`NOOP`/`FAILED`) *after* the tx commits or rolls back (`refresh.ts:99, 123-166`). This is what guarantees a `FAILED` job is always recorded even when the ledger tx rolls back.
- `requestKey` = caller-supplied **or** a canonical-JSON SHA-256 content hash (`refresh.ts:44-54`).
- `targetEntityId`, `actorUserId` are **scalars, not FKs** (history-safe). Only `organizationId` is a real cascade relation.
- **No `ActivityLog` coupling** — the `RefreshJob` row *is* the sole audit surface (`schema.prisma:387-388`). Jobs are self-auditing here.

### 1.2 Retry / error precedent — email outbox (`lib/email/`, `prisma/schema.prisma:568-590`)
- `EmailMessage` write-ahead ledger: `EmailStatus { PENDING, SENT, FAILED }`, `attempts`, `maxAttempts @default(3)`, `error`, `providerMessageId`, `correlationId`, `lastAttemptAt`, `sentAt`; `@@index([status])`, `@@index([organizationId])`. Stores **metadata only, never the body** (`schema.prisma:561-567`).
- `RetryPolicy = "inline-only" | "drainable" | "manual-only"` (TS union, `types.ts:39-53`) resolved from a closed `MESSAGE_REGISTRY`.
- Error classification is **transport-local** via `SendResult.permanent` (SMTP: `EAUTH`/`EENVELOPE`/`EMESSAGE` + `5xx` permanent, else transient; `transports/smtp.ts:11-21`). **No central error-category enum today.**
- **No dead-letter table**; terminal failure = `FAILED` + `attempts >= maxAttempts` (row simply stops matching the drain query). `manual-only` is reserved and unused.
- **`drain()` has zero callers** — the retry engine exists but is not wired to any scheduler (`message-service.ts:97`, "the future cron target").
- Body-less **replay from source of truth** via a per-kind `ResendResolver` keyed on `correlationId`; `null` → terminal fail (`message-service.ts:118-125`).
- The outbox write is **decoupled from the domain `$transaction`** (best-effort, never blocks the primary write; `settings/team/actions.ts:273-283`).
- Safety gate = default **`console` no-network transport** + fail-fast env validation (`transports/index.ts:10-16`, `env.ts:48-79`); no dry-run flag or allowlist.

### 1.3 Audit / actor / org precedent — `ActivityLog` (`prisma/schema.prisma:1749-1770`)
- Fields: `organizationId` (required, cascade), `opportunityId?`, `propertyId?`, `sellerId?`, `buyerId?`, `actorId?`, `eventType` (**free-form String, no enum**), `eventLabel`, `eventBody?`, `createdAt`. **Only `@@index([organizationId])`.**
- **`actorId` is `String?` but a hard FK to `User` (`onDelete: SetNull`)** — a non-null value *must* reference a real `users.id`. **There is no non-user actor concept today**; the only non-human option is `actorId: null` ("system event"), which carries no identity (`notifications.ts:13-19`).
- Append pattern = per-service local `audit(...)` helper doing `prisma.activityLog.create({...}).catch(() => {})` — **best-effort, written *after* the domain `$transaction` commits** (`closing-service.ts:142-146, 182`; `escrow-service.ts:56-58`; `authorize.ts:33-57`).
- **A named, non-impersonating Automation Principal has no representation in the current model** without an additive schema change (§Determination 10).

### 1.4 RBAC / policy / runtime precedents
- RBAC = string-union `Resource` + `Action` + a `Record<Resource, Capability>` `MATRIX` in **pure** `lib/permissions.ts` (`:11-97`). Resources today: `SELLER, PROPERTY, OPPORTUNITY, DEAL_ANALYSIS, BUYER, BUYER_MATCH, TASK, NOTE, DOCUMENT, TEAM, INVITATION, ORGANIZATION, OWNER, OWNER_IDENTITY, PROPERTY_IDENTITY, REFRESH, UNDERWRITING, UNDERWRITING_APPROVAL, CLOSING`. Actions: `CREATE|READ|UPDATE|DELETE|MANAGE`. Adding a domain = **one `Resource` line + one `MATRIX` row**.
- Enforcement in `lib/authorize.ts`: `authorize()` (throws), `checkAuthorized()` (bool + best-effort denial audit). `Principal = { id: string; role: UserRole; organizationId: string }`.
- ADMIN-only reasoned overrides are **separate boolean guards** (`canWaiveClosingItem`, `canResolveEscrow`, `canExecuteAssignment`, …).
- **No three-valued decision enum exists.** Closest structured-decision idioms: a `{ ready, blockingLabels, message }` object (`closing-service.ts:120-130`) and `string | null` reason-or-null (`authz.ts:19-39`).
- The composed PAID gate: pure `isClosingReady(items)` (`closing.ts:16-18`) **composed with** `authorizeStageMove(...)` — the gate never replaces the role check (`opportunities/actions.ts:235-252`).
- Transactions: interactive callback `prisma.$transaction(async (tx) => …)`, **no isolation level set anywhere**, `tx`-or-`prisma` param idiom (`type Db = Prisma.TransactionClient | typeof prisma`). ActivityLog writes happen **after** commit, best-effort.
- **Runtime: exactly one PM2 app** `crowdexpanse-commercial` (`instances: 1`, `exec_mode: "fork"`, no `cron_restart`; `ecosystem.config.js`). **No worker, background, queue, or cron process exists.** All current "async-looking" work (refresh, projections, decisions) is synchronous, in-request, single-process. **An out-of-request executor is net-new infrastructure with no pattern to copy** — the single most important constraint for this phase.
- Migrations: `prisma migrate deploy`, additive-only, currently **26** on prod. `scripts/backup.sh` before deploy. Release-acceptance workflow per the memory note.
- Health: one unauthenticated `/api/health` (DB round-trip liveness → `{ status, dbMs, uptime, commit }`). **No metrics/ops endpoint.** `lib/telemetry.ts` is a pure helper with no HTTP surface.
- Tests: `node scripts/run-unit-tests.mjs` (CRITICAL modules ≥90% branch, overall ≥80%); `scripts/e2e-*.mjs` auto-discovered by `e2e-all.mjs`, each in its own `tsx` child, **refusing to run outside a `*_test` DB** (`assertTestDatabase`); two-org isolation is the standard E2E shape; Playwright visual harness on port 3199 against the `_test` DB.

---

## 2. Determination 1 — Domain model (minimum schema)

**Principle:** the smallest model that fully preserves the ratified architecture lock.

| Conceptual entity (AU-1) | Phase 2.0.1 representation | Rationale |
|---|---|---|
| **AutomationJob** | **DB model** (new) | The durable unit of intent + lifecycle. `RefreshJob` precedent. Required. |
| **AutomationExecution** | **DB model** (new, **insert-only**) | Immutable per-attempt audit ledger (A8, the primary addition). Required, and **separated** from the job (see Determination 2). |
| **AutomationResult** | **Folded into `AutomationExecution`** (outcome + counters + `producedDomainEffect` + `contextFingerprint`) | `RefreshJob` folds result into the row; here it folds into each immutable execution. No separate model. |
| **AutomationPolicy** | **Pure code** (`lib/automation/policy.ts`) + an integer `policyVersion` stamp on job & execution | Mirrors `lib/permissions.ts` / `lib/closing.ts` being pure, versioned code. DB-backed *configurable* policies are deferred. |
| **AutomationAction** | **Not modeled** (enum `automationType` + structured effect summary on the execution) | The proof job performs no domain mutation, so there is no discrete "action" to persist. First-class model deferred to the first mutating phase. |
| **AutomationProposal** | **Deferred entirely** (reserved) | Proposals (human-commit-required outputs) belong to the AI/recommendation phases, not the spine. |

**Net new schema for 2.0.1:** two models — `AutomationJob`, `AutomationExecution` — plus their
enums, plus **one additive column set on `ActivityLog`** for principal attribution
(Determination 10). Full field lists, indexes, and constraints are in the
[Schema Proposal](./VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md).

---

## 3. Determination 2 — Job lifecycle (and job/attempt separation)

**Job state and execution-attempt state ARE separated** (the deliberate improvement over
`RefreshJob`, which folds them). Rationale: A8 mandates an *immutable* execution ledger. A
row that must be updated `RUNNING → SUCCEEDED` cannot be immutable. So:

- **`AutomationJob`** carries the **mutable lifecycle** (current status, attempt counter, lease, next-attempt time). It is the queue row and the recoverable unit.
- **`AutomationExecution`** is **insert-only**: exactly one immutable row per *completed or abandoned attempt*. Never updated. In-progress state lives only on the job (status `RUNNING` + `leaseExpiresAt`).

### Job lifecycle (`AutomationJob.status`)

```
              ┌──────────── operator/superseding cancel ───────────┐
              ▼                                                     │
  (create) PENDING ──scheduler──▶ QUEUED ──executor claim──▶ RUNNING
                                    ▲                          │
                                    │                          ├─ attempt SUCCEEDED ─▶ SUCCEEDED ✔ (terminal)
                       retry due    │                          │
              RETRY_SCHEDULED ──────┘                          ├─ attempt FAILED, retryable, attempts<max
                    ▲                                          │      └─▶ RETRY_SCHEDULED
                    └──────────────────────────────────────────┘
                                                               ├─ attempt FAILED, permanent OR attempts≥max
                                                               │      └─▶ DEAD_LETTERED ✖ (terminal, operator-actionable)
                                                               └─ (crash: lease expires) ─reaper─▶ RETRY_SCHEDULED or DEAD_LETTERED

  CANCELLED ✖  (terminal) — from PENDING / QUEUED / RETRY_SCHEDULED only
  SUPERSEDED ✖ (terminal) — a newer job for the same idempotency scope replaces a still-pending one
```

**States:** `PENDING, QUEUED, RUNNING, RETRY_SCHEDULED, SUCCEEDED, DEAD_LETTERED, CANCELLED, SUPERSEDED`.

**Deliberate placement of `FAILED`:** `FAILED` is an **attempt-grain** outcome, recorded on
each `AutomationExecution` — *not* a job status. At the job grain, a run that cannot succeed
ends in **`DEAD_LETTERED`** (operator-actionable) rather than a bare `FAILED`, so the
operator surface distinguishes "one attempt failed" (execution ledger) from "this job is
done failing and needs a human" (job status). This directly answers the founder's "whether
job state and execution-attempt state must be separated" → **yes, separated.**

| Concern | Rule |
|---|---|
| **Terminal states** | `SUCCEEDED`, `DEAD_LETTERED`, `CANCELLED`, `SUPERSEDED`. No transition leaves a terminal state. |
| **Non-terminal** | `PENDING`, `QUEUED`, `RUNNING`, `RETRY_SCHEDULED`. |
| **Retry transitions** | `RUNNING → RETRY_SCHEDULED` (transient failure, attempts remain) → `QUEUED` (at `nextAttemptAt`). |
| **Recovery transitions** | `RUNNING` with expired lease → reaper → `RETRY_SCHEDULED` (attempts remain) or `DEAD_LETTERED`. The reaper writes an immutable execution row (`outcome=FAILED`, `failureClass=UNKNOWN`, note "lease expired / abandoned") so the ledger stays complete. |
| **Stale-running handling** | A job is stale iff `status=RUNNING AND leaseExpiresAt < now`. Only the reaper transitions stale jobs. Claiming sets `leaseExpiresAt = now + LEASE_TTL`; the executor renews on long work (2.0.1 work is sub-second, so a single lease suffices). |
| **Cancellation** | Allowed from `PENDING/QUEUED/RETRY_SCHEDULED` (immediate → `CANCELLED`). A `RUNNING` job cannot be force-cancelled in 2.0.1; cancel of a running job is deferred (documented). |
| **Supersession** | When the scheduler creates a job whose idempotency scope (Determination 4) matches an existing *non-terminal* job of an *older* occurrence, the older job → `SUPERSEDED`. Prevents backlog pile-up of periodic jobs. |

---

## 4. Determination 3 — The immutable execution ledger

`AutomationExecution` is **insert-only** — one row per attempt, **never updated or deleted**
(AU-8). Each row records everything needed to answer, without reading any other table:

| Question | Field |
|---|---|
| Which job ran? | `automationJobId` (scalar-safe FK to job, `onDelete: Cascade` with the org) |
| Which organization? | `organizationId` (required, indexed) |
| Which attempt? | `attemptNumber` (`@@unique([automationJobId, attemptNumber])`) |
| Why did it run? / which trigger? | `triggerType` (enum), `triggerRef` (scalar, nullable) |
| Which policy, which version? | `policyKey`, `policyVersion`, `policyDecision` (enum) |
| Which context/projection consumed? | `contextFingerprint` (SHA-256 hash — reproducibility without storing the body; email "no body" + RefreshJob content-hash precedent) |
| When did it run? | `startedAt`, `finishedAt`, `durationMs` |
| Did it succeed? | `outcome` (`SUCCEEDED | NOOP | FAILED`) |
| Did it produce domain effects? | `producedDomainEffect` (Boolean — **always `false` in 2.0.1**) |
| Is retry allowed? | `retryAllowed` (Boolean) |
| Which failure class? | `failureClass` (enum, nullable), `error` (String, nullable) |
| Which ActivityLog entry resulted? | `activityLogId` (scalar, nullable — set only if the best-effort post-commit write succeeded) |
| Which principal performed the work? | `principalType` (`AUTOMATION`), `principalKey` |
| Correlation / causation | `correlationId`, `causationId` (nullable scalars; email `correlationId` precedent) |
| Human approver (future REQUIRE_APPROVAL) | `approvedByUserId` (scalar, nullable — reserved) |

**Immutability:** every field is immutable; the row is written **once**, inside the same
`$transaction` that finalizes the job's status (Determination 7). There is no update path in
the service. The execution ledger is **never reversed or deleted** (Determination 11).

---

## 5. Determination 4 — Idempotency

**Canonical creation key** (compound `@@unique`, extending the `RefreshJob` anchor):

```
@@unique([organizationId, automationType, sourceType, sourceId, policyVersion, occurrenceKey])
```

| Level | Mechanism |
|---|---|
| **Creation-time dedup** | Read-check-then-create on the compound unique (RefreshJob idiom): scheduler computes the key, `findUnique` → returns the existing job → else `create`. Identical trigger for the same source at the same `policyVersion` in the same occurrence window yields exactly one job. |
| **Execution-time dedup** | `@@unique([automationJobId, attemptNumber])` — an attempt number is claimed atomically with the `RUNNING` transition, so no attempt is double-recorded even under concurrent executors. |
| **Effect-level idempotency** | 2.0.1's proof job produces **no** domain effect, so effect idempotency is trivially satisfied. The forward pattern (an effect keyed by `executionId`, written in the same tx as the execution) is documented for the first mutating phase. |
| **Provider-level idempotency (future)** | Reserved: outbound providers (email/SMS) will key on `executionId` as their provider idempotency token (email `correlationId` precedent). Out of scope for 2.0.1. |
| **Replays** | A replay of an already-terminal job is refused (idempotent no-op returning the prior job). |
| **Policy-version change** | Because `policyVersion` is **in the key**, bumping the policy creates a **new** job (a deliberate re-evaluation under new rules), never a silent replay of an old decision. |
| **Stale / superseded** | A newer occurrence for the same `(org, type, source)` supersedes older non-terminal jobs → `SUPERSEDED` (Determination 3). |

**`occurrenceKey`** = a deterministic bucket. For the schedule-triggered proof job it is a
UTC time-bucket (e.g. `YYYY-MM-DDTHH`) per target, so the job runs at most once per bucket
per target **by construction**. For future event-driven jobs it will be the triggering
event id.

---

## 6. Determination 5 — Policy boundary

**Policy is pure, versioned code** (`lib/automation/policy.ts`), added to the unit-test
`CRITICAL` set (≥90% branch). It receives deterministic, organization-scoped context and
returns a structured decision — a shape that does **not** exist today and is introduced here:

```
type AutomationDecision =
  | { kind: "ALLOW" }
  | { kind: "DENY";            reason: string }
  | { kind: "REQUIRE_APPROVAL"; reason: string }   // reserved; unused by the 2.0.1 read-only proof job
  | { kind: "NO_ACTION";       reason: string }     // nothing to do — a clean NOOP
  | { kind: "STALE_CONTEXT";   reason: string }     // context changed under us; do not act on stale data
```

| Question | Determination |
|---|---|
| **Where is RBAC evaluated?** | Two layers. (1) The executor checks the **Automation Principal's** capability against the new `AUTOMATION` resource *before* invoking any domain read/service. (2) The underlying domain service **still runs its own `authorize()`** — automation never bypasses the existing enforcement (AU-4, defense in depth). |
| **Whom does RBAC apply to?** | The **Automation Principal** always. When a future action needs human approval (`REQUIRE_APPROVAL`), the **approving user's** role is additionally checked at commit time. The 2.0.1 read-only proof job needs only the Principal's `READ` capability. |
| **How are policies versioned?** | An integer `POLICY_VERSION` constant per policy, stamped onto every job and every execution. Any behavioral change bumps it (and, via Determination 4, forces re-evaluation rather than replay). |
| **How is policy input recorded?** | As `contextFingerprint` (a SHA-256 over the canonicalized context) on the execution — reproducibility without persisting the raw context (email "no body" + RefreshJob content-hash precedent). |
| **How do policies stay pure & testable?** | No Prisma, no clock, no I/O — plain context in, decision out. Mirrors `lib/permissions.ts` and `lib/closing.ts`. Unit-tested directly. |
| **How are workers prevented from bypassing policy?** | The **Executor is the only component permitted to invoke a domain service on automation's behalf, and it always calls `evaluatePolicy()` first** (AU-4). A `DENY`/`NO_ACTION`/`STALE_CONTEXT` short-circuits before any domain call and is recorded on the execution. The domain service's own `authorize()` is a second, independent gate. There is no code path from queue to domain mutation that skips policy. |

---

## 7. Determination 6 — Scheduler & queue boundary (the material infra choice)

**Constraint (grounded, §1.4):** the platform is a single PM2 **fork** process with **no
background/worker/cron** anything. Out-of-request execution is net-new. We therefore choose
the **smallest production-safe design that preserves replaceability**, and we justify each
rejection.

| Option | Verdict | Why |
|---|---|---|
| External broker (Redis + Bull/BullMQ) | **Rejected** for 2.0.1 | New runtime dependency + new failure surface + new ops burden, for a volume of ~tens of jobs/org/day. Not justified by evidence. |
| In-request poller (inside the web process) | **Rejected** | Cannot run when there is no HTTP traffic; couples execution to the web process's lifecycle; violates A2 scheduling↔execution separation. |
| **DB-backed queue (the `AutomationJob` table) + `SELECT … FOR UPDATE SKIP LOCKED` claiming + one dedicated PM2 process** | **CHOSEN** | Postgres already present (no new infra); `SKIP LOCKED` gives safe concurrent claiming natively; a second PM2 fork is the minimal out-of-request executor; fully replaceable later behind the same `AutomationJob` contract. |
| Transactional outbox (domain-write enrolls a job in the same tx) | **Deferred to 2.0.2** | Preferred long-term (A6) but requires touching existing domain write paths. 2.0.1 stays schedule-triggered to avoid any change to V1.x domain transactions. The seam is designed, not built. |

**What 2.0.1 introduces:**
- **A new PM2 process `crowdexpanse-automation`** (`instances: 1`, `exec_mode: "fork"`, added to `ecosystem.config.js`) running three cooperating loops, **separated in code** per A2 but co-located in one process for ops simplicity (explicitly separable later):
  1. **Scheduler loop** — computes due work, creates/enqueues `PENDING → QUEUED` jobs, seeds the next periodic occurrence, and supersedes stale duplicates. *Decides when.*
  2. **Executor loop** — claims `QUEUED` (and due `RETRY_SCHEDULED`) jobs via `FOR UPDATE SKIP LOCKED`, evaluates policy, runs the (read-only) job body, writes the immutable execution + finalizes the job. *Decides whether/what and does it.*
  3. **Reconciliation (reaper) loop** — recovers stale `RUNNING` leases (Determination 3).
- **No external broker, no Redis, no new npm package** for queueing — the table is the queue.

The web process is **not** modified to execute jobs. It may (later phases) *enqueue* jobs;
in 2.0.1 all enqueue is done by the automation process's scheduler.

**This new PM2 process is the single material piece of net-new infrastructure in the phase**
and is called out as such in the [Rollout Plan](./VERSION_2_0_PHASE_2_0_1_ROLLOUT_PLAN.md)
and [ADR-0002](./adr/ADR-0002-dedicated-automation-process.md).

---

## 8. Determination 7 — Transaction boundaries & the dual-write problem

| Step | Atomicity |
|---|---|
| **Job creation** (2.0.1: scheduler) | Own `$transaction`: read-check-then-create on the idempotency unique. (Future event-driven: the job row is written **in the same `$transaction` as the triggering domain write** — a true transactional outbox — so a domain change and its automation job commit atomically. Reserved for 2.0.2.) |
| **Claim** | One `$transaction`: `SELECT … FOR UPDATE SKIP LOCKED` a due job → set `RUNNING`, `leaseExpiresAt`, increment `attempts`, reserve `attemptNumber`. Prevents two executors running the same job. |
| **Policy + job body** | Pure/read-only; no writes. |
| **Finalize** | **One `$transaction`** inserts the immutable `AutomationExecution` **and** updates the `AutomationJob` status. (In a future mutating phase, the domain-service mutation joins this same tx via the `tx`-or-`prisma` idiom, so effect + ledger + job status commit atomically or not at all.) |
| **ActivityLog append** | **After** the finalize tx commits, **best-effort `.catch(() => {})`** (the platform's universal convention). The execution's `activityLogId` is back-filled only if the write succeeded — but the execution row is authoritative regardless. |

**Dual-write resolution:** the **execution ledger is authoritative and in-transaction**;
the **ActivityLog mirror is best-effort and post-commit** (exactly the email-outbox
`mirror()` and closing-service `audit()` conventions). A failed ActivityLog write can never
roll back or fail a job, and never leaves the ledger inconsistent. No isolation level is set
(matching the codebase); correctness rests on `SKIP LOCKED` claiming + the compound unique.

---

## 9. Determination 8 — Failure classification

Expands the email outbox's binary `permanent` flag into a domain enum. `failureClass` on
each execution, with a per-class policy:

| Class | Retryable? | Backoff | Alert threshold | Dead-letter | Operator action |
|---|---|---|---|---|---|
| `TRANSIENT_INFRASTRUCTURE` | Yes | exp, capped | rate spike | after `maxAttempts` | usually none (self-heals) |
| `DATABASE_CONTENTION` | Yes | short exp | sustained | after `maxAttempts` | investigate load |
| `DEPENDENCY_UNAVAILABLE` | Yes | exp, capped | sustained | after `maxAttempts` | check dependency |
| `POLICY_DENIED` | No | — | never (expected) | no — resolves to a terminal `NOOP`/denied disposition | none |
| `STALE_CONTEXT` | No (this occurrence) | — | high rate only | no — supersede / re-derive | none |
| `VALIDATION_FAILURE` | No | — | any | immediate | fix input/policy |
| `PERMISSION_FAILURE` | No | — | **any (alert)** | immediate | review RBAC |
| `ORG_SCOPE_VIOLATION` | No | — | **any (alert, invariant breach)** | immediate | **investigate — must never happen** |
| `INVARIANT_VIOLATION` | No | — | **any (alert)** | immediate | investigate |
| `UNKNOWN` | Yes, bounded | exp, capped | any | after a **low** cap | inspect execution `error` |

**Backoff (an improvement over the email outbox, which had none):** a new
`nextAttemptAt` column; `nextAttemptAt = now + min(BACKOFF_CAP, BACKOFF_BASE * 2^attempt)`.
The executor only claims `RETRY_SCHEDULED` jobs whose `nextAttemptAt <= now`.
`ORG_SCOPE_VIOLATION`, `PERMISSION_FAILURE`, and `INVARIANT_VIOLATION` are **never retried**
and always surface to the operator health projection (Determination 12).

---

## 10. Determination 9 — Organization isolation

Grounded reality: **no RLS, no middleware, no `Membership` model** — org-scoping is
convention (`organizationId` threaded explicitly). Automation must be equally disciplined and
**fail closed**.

| Concern | Determination |
|---|---|
| **How org identity enters the job** | `AutomationJob.organizationId` (required, `onDelete: Cascade`) is set at creation from the per-org scheduling context. Every job belongs to exactly one org. |
| **How it is validated during execution** | The executor threads the job's `organizationId` into policy context and every domain read/service call. Domain reads reuse the existing `findFirst({ where: { id, organizationId } })` pattern. |
| **How service calls are scoped** | Reuse existing org-scoped services and projections unchanged (e.g. `projectClosingBadges` / the closing read model for the proof job). |
| **How cross-org refs fail closed** | `triggerRef`/target ids are validated via an org-scoped `findFirst`; a miss returns null → the job records a `NOOP` (or `STALE_CONTEXT`) and **never acts across orgs** (AU: no cross-org read/write). |
| **How system-wide scheduling discovers orgs without leaking** | The scheduler enumerates `Organization` ids **only to seed one single-org job per org**. Enumeration of org ids for scheduling ≠ cross-org data access: once a job exists, all its work is strictly single-org. No query in the executor ever spans organizations. |
| **How per-org concurrency is controlled** | The claim query enforces fairness (bounded in-flight per org) so one busy org cannot starve others. 2.0.1 ships a simple global concurrency cap + a documented per-org fairness note; a hard per-org cap is a reserved refinement. |
| **How tests prove isolation** | `scripts/e2e-automation.mjs` (two-org shape): org B can neither observe, claim, finalize, nor requeue org A's jobs/executions; a job's execution touches only its own org's data. |

---

## 11. Determination 10 — Automation Principal

**Grounded gap:** there is **no non-user actor** today; `ActivityLog.actorId` is a hard FK to
`User`. The Principal requirement "produce explicit ActivityLog attribution" therefore
**requires a schema decision**.

**Rejected:** creating a real "system" `User` row per org — it would carry
`hashedPassword`/`role`/login semantics and **impersonate a user**, violating AU-3.

**Chosen (additive, backward-compatible):** extend `ActivityLog` with
- `actorType ActorType @default(USER)` — enum `USER | SYSTEM | AUTOMATION | WEBHOOK`
- `automationExecutionId String?` — a **scalar** (history-safe, like `RefreshJob.actorUserId`), nullable, linking an automation-emitted row to the execution that produced it.

Existing rows and all human writes keep `actorId` (User FK) + default `actorType = USER` —
**zero behavior change** for current code. Automation rows set `actorId = null`,
`actorType = AUTOMATION`, `automationExecutionId = <execution>`, and a distinct eventType
namespace (`automation.*`). This is the **one existing-table touch** in 2.0.1; it is
strictly additive and does not alter the frozen V1.3/V1.4 domain models (ActivityLog is not
part of a frozen release's ownership boundary; the change lands on `main`, never on
`release/1.3` or `release/1.4`).

The in-code Principal (distinct from the human `Principal`):
```
type AutomationPrincipal = {
  type: "AUTOMATION";
  key: string;              // stable automation identity (never a user id)
  organizationId: string;   // carries org context
  policyKey: string;
  policyVersion: number;    // carries policy context
  correlationId?: string;
  causationId?: string;
};
```
It **acts as `AUTOMATION`, never impersonates a user**, carries org + policy + correlation/
causation context, links approved actions to the approving human via the reserved
`approvedByUserId` (future `REQUIRE_APPROVAL`), and produces explicit attributed ActivityLog
rows. RBAC for the principal is a conservative fixed capability set (READ-only for the 2.0.1
proof job) checked against the new `AUTOMATION` resource.

---

## 12. Determination 11 — Reversibility

- **The execution ledger is never reversed or deleted** (AU-8) — immutable, insert-only.
- **The 2.0.1 proof job produces no domain effect**, so there is nothing to reverse; the phase deliberately **does not introduce a business-domain effect merely to demonstrate reversibility**.
- For future effects, the taxonomy is fixed now (design-only): **reversible** (a compensating inverse exists and is safe to auto-apply), **compensating** (requires a recorded compensating action), **non-reversible** (must be `REQUIRE_APPROVAL` before execution), **approval-gated** (any effect touching Closing/Escrow/Financing/Assignment/Underwriting/PAID/checklist/waiver state — always human-committed, never autonomous).

---

## 13. Determination 12 — Operational health (minimum surfaces)

Reuse the **projection pattern** (pure module → thin read service → thin surface) rather than
building a dashboard.

- **`lib/automation/health.ts`** (pure projection over `AutomationJob` + `AutomationExecution`, added to `CRITICAL`) computing: queue depth (`PENDING`+`QUEUED`), oldest-pending age, running count, **stale** (lease-expired `RUNNING`) count, `RETRY_SCHEDULED` count, **dead-letter count**, success/failure rates over a window, execution duration (avg/p95), policy-denial count, and **org-scope-violation count**.
- **One authenticated ops read** — `app/api/automation/health/route.ts` (ADMIN, org-scoped) returning that projection as JSON. The unauthenticated `/api/health` liveness probe is left unchanged.
- **Operator-safe replay/requeue** — an **ADMIN-only** action to requeue a `DEAD_LETTERED` job. Requeue creates a **new** attempt (`RETRY_SCHEDULED → QUEUED`); it **never mutates or deletes any prior execution row**. Gated by `canRequeueAutomationJob(role) = role === ADMIN` (the ADMIN-override-guard idiom).
- **No full dashboard UI** in 2.0.1 (no repository evidence justifies it for the spine).

---

## 14. First-slice scope constraint — the proof job

**Chosen proof job: an internal, deterministic *closing-readiness observation* job.**

Per org, on a schedule, for each **in-flight** opportunity, the job:
1. Reads the **existing shared closing projection** (`projectClosingBadges` / the closing read model — realizing TX-6 Projection Reuse). *Reads an existing shared projection.*
2. Validates policy + organization context. *Policy + org gate.*
3. Records an **immutable `AutomationExecution`** capturing the observed closing-health snapshot fingerprint + counts. *Immutable execution result.*
4. Optionally writes **one** best-effort, org-scoped, attributed `automation.observed` ActivityLog summary per run (policy-gated), proving **linkage without replacing** ActivityLog. *Non-authoritative observation only.*

It **creates no external communication; changes no Closing/Escrow/Financing/Assignment/
Underwriting/Opportunity-stage/checklist/waiver/PAID state; calls no AI; modifies no
calculation; needs no new provider** — yet exercises scheduling, queueing, execution, policy,
audit, retry, deduplication, crash recovery, and organization isolation. `occurrenceKey` is a
per-opportunity UTC time-bucket, making it idempotent by construction.

This satisfies every "must prove" property (§0) with the safest possible payload.

---

## 15. Files likely to change (all new, except two additive touches)

| Path | New/Changed | Purpose |
|---|---|---|
| `prisma/schema.prisma` | **Changed (additive)** | `AutomationJob`, `AutomationExecution` models; automation enums; additive `ActivityLog.actorType` + `automationExecutionId`; `ActorType` enum; org back-relations |
| `prisma/migrations/<new>/migration.sql` | New | One additive migration (→ 27) |
| `lib/automation/types.ts` | New | `AutomationDecision`, `AutomationPrincipal`, lifecycle/enum TS types |
| `lib/automation/policy.ts` | New (pure, CRITICAL) | `evaluatePolicy(context) → AutomationDecision`; `POLICY_VERSION` |
| `lib/automation/idempotency.ts` | New (pure, CRITICAL) | canonical key + `contextFingerprint` (SHA-256) |
| `lib/automation/lifecycle.ts` | New (pure, CRITICAL) | legal-transition + failure-class → disposition + backoff functions |
| `lib/automation/health.ts` | New (pure, CRITICAL) | ops health projection |
| `lib/automation/job-service.ts` | New | org-scoped create (read-check-then-create), claim (`SKIP LOCKED`), finalize, requeue, reads |
| `lib/automation/executor.ts` | New | claim → policy → run proof job → finalize; best-effort ActivityLog mirror |
| `lib/automation/scheduler.ts` | New | enumerate orgs → seed/enqueue per-org occurrences → supersede |
| `lib/automation/reaper.ts` | New | stale-lease recovery |
| `lib/automation/proof-observer.ts` | New (pure body) | the read-only closing-readiness observation |
| `lib/permissions.ts` | **Changed (additive)** | one `AUTOMATION` resource + one `MATRIX` row + `canRequeueAutomationJob` |
| `bin/automation-runtime.ts` (or `scripts/automation-runtime.mjs`) | New | the PM2 process entrypoint running the three loops |
| `ecosystem.config.js` | **Changed (additive)** | second app `crowdexpanse-automation` |
| `app/api/automation/health/route.ts` | New | ADMIN ops JSON read |
| `scripts/run-unit-tests.mjs` | **Changed (additive)** | add the four pure modules to `CRITICAL` |
| `tests/unit/automation/*.test.ts` | New | policy / idempotency / lifecycle / health unit tests |
| `scripts/e2e-automation.mjs` | New | two-org isolation + lifecycle E2E (auto-discovered) |

No file under `lib/analysis.ts`, the underwriting engine, the closing lifecycle, the PAID
gate, or any V1.3/V1.4 lock is touched.

---

## 16. Implementation commit sequence (when authorized)

Each commit is independently reviewable, typechecks, and passes the gate. **None of this
runs until Founder approval.**

1. **Schema + migration (additive)** — two models, enums, additive `ActivityLog` columns; `prisma migrate dev` locally; `prisma migrate status` clean. No behavior yet.
2. **Pure modules + unit tests** — `types`, `idempotency`, `lifecycle`, `policy`, `health`; add to `CRITICAL`; ≥90% branch. No I/O.
3. **RBAC** — `AUTOMATION` resource + `MATRIX` row + `canRequeueAutomationJob`; permission unit tests.
4. **Job service** — create/claim/finalize/requeue/reads; org-scoped; `SKIP LOCKED` claim.
5. **Executor + proof observer + scheduler + reaper** — wired to the job service; best-effort ActivityLog mirror.
6. **Runtime entrypoint + `ecosystem.config.js`** — the `crowdexpanse-automation` process; runnable but idle-safe.
7. **Ops health endpoint** — ADMIN JSON read over `lib/automation/health.ts`.
8. **E2E** — `scripts/e2e-automation.mjs` (two-org isolation, full lifecycle, retry, dead-letter, crash recovery, idempotency).
9. **Docs sync** — flip this package's status on acceptance; update dashboard/master plan/roadmap/tech-debt.

---

## 17. Known deferrals

- Event-driven / transactional-outbox triggering from domain writes → **2.0.2**.
- `AutomationProposal` / `AutomationAction` first-class models; any domain-mutating automation → later phase (human-commit + approval).
- DB-backed configurable policies (policies are code in 2.0.1).
- Outbound communications (email/SMS), reminders, AI — separate ratified phases.
- Hard per-org concurrency cap; `RUNNING`-job cancellation; execution/`ActivityLog` composite index (shares the deferred TX-A/TL-9/LB-8 benchmark gate).
- Full ops dashboard UI (JSON endpoint only in 2.0.1).

---

## 18. Risk register (phase-specific)

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| P1 | New PM2 process is net-new infra with no precedent | Med | Med | Idle-safe loops; single instance; `SKIP LOCKED`; can be stopped with zero effect on the web app; ADR-0002 |
| P2 | Two executors double-run a job | Low | High | `FOR UPDATE SKIP LOCKED` claim + `@@unique([automationJobId, attemptNumber])` |
| P3 | Crash mid-attempt leaves a stuck `RUNNING` | Med | Med | Lease + reaper reconciliation; immutable "abandoned" execution row |
| P4 | Cross-org leakage via scheduler enumeration | Low | **Critical** | Enumerate org ids only to seed single-org jobs; executor never spans orgs; `ORG_SCOPE_VIOLATION` alerts; two-org E2E |
| P5 | Additive `ActivityLog` change affects existing reads | Low | Med | Defaults preserve every existing row (`actorType = USER`); Timeline/notifications behavior unchanged; additive-only migration |
| P6 | Retry storm / backlog of periodic jobs | Low | Med | Supersession of stale occurrences; exponential backoff w/ cap; dead-letter after `maxAttempts` |
| P7 | Policy bypass by a worker | Low | High | Executor is the sole domain caller and always evaluates policy first; domain `authorize()` is an independent second gate (AU-4) |
| P8 | Migration drift on prod (currently 26) | Low | Med | Additive-only; `prisma migrate status` gate; `backup.sh` before deploy |

---

## 19. Traceability — every proposed change → a ratified invariant

| Proposal | Invariant / precedent |
|---|---|
| Two-model job/execution split | AU-8 (immutable execution ledger); A8 |
| Insert-only execution ledger | AU-8; email/RefreshJob audit precedents |
| Mandatory policy before any domain call | AU-4; PAID-gate composition precedent |
| Automation Principal, never a user | AU-3; ActivityLog actor gap |
| Read-only proof job, no domain mutation | AU-1; standing V2.0 rule (never owns business state) |
| No external comms / AI in the spine | Standing V2.0 rules; scope constraint |
| Org-scoped, fail-closed | AU (no cross-org read/write); D2 convention |
| Dedicated process + DB queue, no broker | A2 (scheduling↔execution separation); MVP discipline |
| Event-driven deferred to 2.0.2 | A6 (preferred, not forced); avoids touching frozen domain tx |
| Best-effort post-commit ActivityLog mirror | AU-8 (never overwrite history); best-effort audit convention |

---

*End of Phase 2.0.1 Implementation Plan — PENDING FOUNDER APPROVAL FOR IMPLEMENTATION.*
