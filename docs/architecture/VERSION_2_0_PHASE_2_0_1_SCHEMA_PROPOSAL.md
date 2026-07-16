# Version 2.0 · Phase 2.0.1 — Schema Proposal

> **Status: PENDING FOUNDER APPROVAL FOR IMPLEMENTATION.** Proposed Prisma schema only.
> **No schema has been changed; no migration has been generated; no `prisma migrate` command
> has been run.** The Prisma blocks below are illustrative of the intended shape, to be
> authored exactly only after approval. Prod remains at **26 migrations**; this proposes the
> **27th** (additive-only).
>
> **Companion:** [Implementation Plan](./VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md)
> (determinations D1–D12) · [Automation Architecture Lock](./AUTOMATION_ARCHITECTURE_LOCK.md)
> (AU-1…AU-13). Frozen V1.3/V1.4 models untouched; change lands on `main` only.

---

## 1. Summary of the change

- **Two new models:** `AutomationJob` (mutable lifecycle / queue row), `AutomationExecution` (immutable, insert-only audit ledger).
- **New enums:** `AutomationJobStatus`, `AutomationExecutionOutcome`, `AutomationTriggerType`, `AutomationPolicyDecision`, `AutomationFailureClass`, `AutomationPrincipalType`, and `ActorType`.
- **One additive touch to an existing model:** `ActivityLog` gains `actorType ActorType @default(USER)` and `automationExecutionId String?` (scalar, nullable). **Zero behavior change** — every existing row and every human write defaults to `actorType = USER`.
- **Two additive back-relations** on `Organization` (`automationJobs`, `automationExecutions`).
- **No column is removed, renamed, retyped, or made stricter.** Entirely additive → safe on the `v1.4.0` baseline, mirroring every prior release's additive-only migration discipline.

Design choices trace to grounded precedents: `RefreshJob` (job idiom, compound-unique
idempotency, scalar history-safe refs, status enum with a reserved `PENDING`), the email
outbox (`attempts`/`maxAttempts`/`error`, metadata-not-body, `correlationId`), and
`ActivityLog` (org-scoping, best-effort audit).

---

## 2. New enums

```prisma
// Job lifecycle (mutable, on AutomationJob). Terminal: SUCCEEDED, DEAD_LETTERED,
// CANCELLED, SUPERSEDED. FAILED is deliberately NOT here — a failed *attempt* is an
// AutomationExecution outcome; a job that can no longer succeed ends DEAD_LETTERED.
enum AutomationJobStatus {
  PENDING
  QUEUED
  RUNNING
  RETRY_SCHEDULED
  SUCCEEDED
  DEAD_LETTERED
  CANCELLED
  SUPERSEDED
}

// Immutable per-attempt outcome (on AutomationExecution). Mirrors the RefreshJob
// terminal trio (SUCCEEDED / NOOP / FAILED).
enum AutomationExecutionOutcome {
  SUCCEEDED
  NOOP
  FAILED
}

// Why a job ran. 2.0.1 uses SCHEDULE; DOMAIN_EVENT/WEBHOOK/MANUAL are reserved for
// later phases (event-driven transactional outbox, external callbacks, operator runs).
enum AutomationTriggerType {
  SCHEDULE
  DOMAIN_EVENT
  WEBHOOK
  MANUAL
}

// Structured policy decision (no such enum exists in the codebase today). REQUIRE_APPROVAL
// is reserved — the 2.0.1 read-only proof job never uses it.
enum AutomationPolicyDecision {
  ALLOW
  DENY
  REQUIRE_APPROVAL
  NO_ACTION
  STALE_CONTEXT
}

// Failure taxonomy (expands the email outbox's binary `permanent` flag). Retry/alert/
// dead-letter behavior per class is defined in the Implementation Plan §9.
enum AutomationFailureClass {
  TRANSIENT_INFRASTRUCTURE
  DATABASE_CONTENTION
  DEPENDENCY_UNAVAILABLE
  POLICY_DENIED
  STALE_CONTEXT
  VALIDATION_FAILURE
  PERMISSION_FAILURE
  ORG_SCOPE_VIOLATION
  INVARIANT_VIOLATION
  UNKNOWN
}

// The principal that performed the work. AUTOMATION never impersonates a user (AU-3).
enum AutomationPrincipalType {
  AUTOMATION
  SYSTEM
  WEBHOOK
}

// Discriminates ActivityLog authorship without overloading the User FK. Existing rows
// and all human writes default to USER — no behavior change.
enum ActorType {
  USER
  SYSTEM
  AUTOMATION
  WEBHOOK
}
```

---

## 3. `AutomationJob` (mutable lifecycle / queue row)

```prisma
// The durable unit of automation intent and its mutable lifecycle. Also the queue row:
// the executor claims due jobs with SELECT ... FOR UPDATE SKIP LOCKED. Idempotency anchor
// is the compound unique below (RefreshJob precedent, extended). This row is UPDATED as it
// moves through its lifecycle; the immutable audit lives in AutomationExecution.
model AutomationJob {
  id             String              @id @default(cuid())
  organizationId String
  automationType String              // e.g. "closing_readiness_observation" (open vocabulary, like ActivityLog.eventType / RefreshJob.sourceKey)
  status         AutomationJobStatus  @default(PENDING)
  triggerType    AutomationTriggerType @default(SCHEDULE)

  // Idempotency scope (Determination 4)
  sourceType     String              // the kind of thing the job is about, e.g. "opportunity"
  sourceId       String              // scalar, NOT an FK (history-safe; may be cross-domain)
  policyKey      String              // which policy governs this job
  policyVersion  Int                 // stamped; part of the idempotency key
  occurrenceKey  String              // deterministic bucket (e.g. "2026-07-16T14" per target)

  // Scheduling / retry
  attempts       Int                 @default(0)
  maxAttempts    Int                 @default(5)
  availableAt    DateTime            @default(now())  // PENDING/QUEUED eligibility time
  nextAttemptAt  DateTime?           // set on RETRY_SCHEDULED (exponential backoff)
  leaseExpiresAt DateTime?           // set on claim (RUNNING); reaper recovers if stale
  runningAttempt Int?                // attemptNumber reserved for the in-flight attempt

  // Bookkeeping
  correlationId  String?
  causationId    String?
  lastFailureClass AutomationFailureClass?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  organization   Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  executions     AutomationExecution[]

  @@unique([organizationId, automationType, sourceType, sourceId, policyVersion, occurrenceKey], name: "automation_job_idempotency")
  @@index([status, availableAt])                 // scheduler/executor claim scan
  @@index([status, nextAttemptAt])               // retry-due scan
  @@index([status, leaseExpiresAt])              // reaper stale-lease scan
  @@index([organizationId, status])              // per-org ops/health (RefreshJob precedent)
  @@map("automation_jobs")
}
```

Notes:
- `sourceId`, `correlationId`, `causationId` are **scalars, not FKs** — history-safe (RefreshJob `targetEntityId`/`actorUserId` precedent). Only `organizationId` is a real cascade relation.
- `maxAttempts @default(5)` (email precedent is 3; automation infra failures warrant a slightly higher default; overridable per job).
- The claim indexes (`[status, availableAt]`, `[status, nextAttemptAt]`, `[status, leaseExpiresAt]`) exist because the automation process **polls** these columns every loop — unlike `ActivityLog`, this table's access pattern *demands* the composite indexes up front.

---

## 4. `AutomationExecution` (immutable, insert-only audit ledger — A8)

```prisma
// One IMMUTABLE row per attempt (completed or abandoned). INSERT-ONLY — never updated,
// never deleted (AU-8). Written inside the same $transaction that finalizes the job's
// status. This is the operational ledger that complements (never replaces) ActivityLog.
model AutomationExecution {
  id                   String                    @id @default(cuid())
  organizationId       String
  automationJobId      String
  attemptNumber        Int

  automationType       String
  triggerType          AutomationTriggerType
  triggerRef           String?                   // scalar; what triggered this attempt

  policyKey            String
  policyVersion        Int
  policyDecision       AutomationPolicyDecision
  contextFingerprint   String                    // SHA-256 of the canonicalized context (no raw body stored)

  startedAt            DateTime
  finishedAt           DateTime
  durationMs           Int

  outcome              AutomationExecutionOutcome
  producedDomainEffect Boolean                   @default(false)  // ALWAYS false in 2.0.1
  retryAllowed         Boolean                   @default(false)
  failureClass         AutomationFailureClass?
  error                String?

  principalType        AutomationPrincipalType   @default(AUTOMATION)
  principalKey         String                    // stable automation identity (never a user id)
  approvedByUserId     String?                   // reserved for future REQUIRE_APPROVAL commits (scalar)

  correlationId        String?
  causationId          String?
  activityLogId        String?                   // scalar; set only if the best-effort mirror succeeded

  createdAt            DateTime                  @default(now())

  organization         Organization              @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  job                  AutomationJob             @relation(fields: [automationJobId], references: [id], onDelete: Cascade)

  @@unique([automationJobId, attemptNumber], name: "automation_execution_attempt")
  @@index([organizationId, createdAt])           // per-org ledger reads / health window
  @@index([organizationId, outcome])             // health success/failure aggregation
  @@index([automationJobId])                     // per-job attempt history
  @@map("automation_executions")
}
```

Notes:
- **Every field is immutable**; the service exposes no update path. Crash-abandoned attempts are recorded by the reaper as `outcome = FAILED`, `failureClass = UNKNOWN`.
- `activityLogId`, `approvedByUserId`, `triggerRef`, `correlationId`, `causationId` are **scalars, not FKs** (history-safe; an ActivityLog row or approver may later be removed without orphaning the ledger).
- `contextFingerprint` gives reproducibility without persisting the context body (email "metadata only" + RefreshJob content-hash precedents).

---

## 5. Additive change to `ActivityLog` (the one existing-table touch)

Only two additive fields; **nothing existing is altered**:

```prisma
model ActivityLog {
  // ... all existing fields unchanged ...
  actorType             ActorType  @default(USER)   // NEW — every existing row & human write defaults to USER
  automationExecutionId String?                     // NEW — scalar, nullable; links an automation-emitted row to its execution
  // ... existing relations unchanged; actorId remains the User? FK ...
}
```

- **Backward compatibility:** the migration adds `actorType` with a `DEFAULT 'USER'` (so every existing row is `USER` without backfill effort) and a nullable `automationExecutionId`. Human writes are unchanged (they simply omit both and inherit the default).
- **`automationExecutionId` is intentionally a scalar, not an FK to `AutomationExecution`** — consistent with `actorId`/`RefreshJob` history-safety and avoiding a hard dependency cycle between the audit substrate and the automation domain.
- Timeline / notifications / `/activity` behavior is unchanged: current consumers ignore the new columns; automation rows use the `automation.*` eventType namespace and are the existing "system event" (`actorId = null`) shape, now *identifiable* via `actorType`.

---

## 6. Additive back-relations on `Organization`

```prisma
model Organization {
  // ... existing ...
  automationJobs       AutomationJob[]        // NEW
  automationExecutions AutomationExecution[]  // NEW
}
```

---

## 7. Indexes & unique constraints — rationale

| Constraint / index | Model | Purpose |
|---|---|---|
| `@@unique([organizationId, automationType, sourceType, sourceId, policyVersion, occurrenceKey])` | Job | Creation-time idempotency (read-check-then-create); RefreshJob precedent extended |
| `@@index([status, availableAt])` | Job | Executor claim scan (`FOR UPDATE SKIP LOCKED`) |
| `@@index([status, nextAttemptAt])` | Job | Retry-due scan |
| `@@index([status, leaseExpiresAt])` | Job | Reaper stale-lease scan |
| `@@index([organizationId, status])` | Job | Per-org health/ops |
| `@@unique([automationJobId, attemptNumber])` | Execution | Execution-time idempotency (no double-recorded attempt) |
| `@@index([organizationId, createdAt])` | Execution | Per-org ledger reads + health window |
| `@@index([organizationId, outcome])` | Execution | Health success/failure aggregation |
| `@@index([automationJobId])` | Execution | Per-job attempt history |

The Job claim/retry/reaper indexes are **not** deferred (unlike the `ActivityLog` composite,
TX-A/TL-9/LB-8) because they are on the automation process's hot polling path from day one.

---

## 8. Migration sequencing

1. **Single additive migration** `2026######_automation_foundation` (→ migration **27**): create the seven enums, the two models with their indexes/uniques, the two additive `ActivityLog` columns (with `DEFAULT 'USER'`), and the two `Organization` back-relations.
2. **Local:** `prisma migrate dev` → `prisma generate`; run the unit + E2E gate against the `_test` DB.
3. **Drift check:** `prisma migrate status` must report clean.
4. **Prod (on approval, per the rollout plan):** `backup.sh` → `prisma migrate deploy` (26 → 27, additive, safe on the `v1.4.0` baseline) → build → restart web → **then** start the `crowdexpanse-automation` process. Migration is safe to apply while the automation process is not yet running (the tables simply sit empty).
5. **No destructive changes**; D15 remains untouched and out of scope.

---

## 9. What is explicitly NOT in this schema

- No `AutomationPolicy`, `AutomationProposal`, or `AutomationAction` tables (Determination 1 — code/enum/deferred).
- No columns for outbound message content, AI prompts/outputs, or provider tokens.
- No change to any V1.3 underwriting model, V1.4 closing/escrow/financing/assignment model, immutable snapshot, or the PAID gate.
- No FK from `ActivityLog` or `AutomationExecution` to a `User` for the automation principal (the principal is never a user).
- No RLS, no Prisma middleware (org-scoping stays convention + explicit `organizationId`, matching the codebase).

---

*End of Phase 2.0.1 Schema Proposal — PENDING FOUNDER APPROVAL FOR IMPLEMENTATION.*
