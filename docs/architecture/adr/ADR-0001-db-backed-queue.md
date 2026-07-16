# ADR-0001 — Database-backed job queue (no external broker)

**Status:** Decision **accepted** within the FOUNDER RATIFIED Automation architecture
(2026-07-16). **Implementation FOUNDER APPROVED FOR IMPLEMENTATION** (Phase 2.0.1).

## Context

Phase 2.0.1 needs a durable, organization-scoped queue that supports idempotent creation,
retries with backoff, dead-lettering, and crash recovery. Grounded repository facts:

- The platform already runs **PostgreSQL** as its only datastore (Prisma, `lib/prisma.ts`).
- There is a proven durable-job precedent — `RefreshJob` (`prisma/schema.prisma:386-416`, `lib/intelligence/refresh.ts`) — using a compound `@@unique([organizationId, sourceKey, requestKey])` idempotency anchor, a status enum with a reserved `PENDING`, and a read-check-then-create idiom.
- The email outbox (`EmailMessage`, `prisma/schema.prisma:568-590`) is a second write-ahead-ledger precedent (`attempts`/`maxAttempts`, `@@index([status])`, a `drain()` retry loop) — though `drain()` currently has **zero callers**.
- **No broker (Redis/Bull/BullMQ), no `node-cron`, and no message queue exist anywhere** in the codebase (grep-confirmed). The expected volume is on the order of tens of jobs per organization per day.

## Decision

**The `AutomationJob` table is the queue.** Due jobs are claimed with
`SELECT … FOR UPDATE SKIP LOCKED` inside a `prisma.$transaction`, which atomically moves a
job to `RUNNING`, sets a lease, and reserves an `attemptNumber`. Retry eligibility is a
`nextAttemptAt` column; the reaper scans stale `leaseExpiresAt`. Idempotent creation reuses
the `RefreshJob` compound-`@@unique` read-check-then-create idiom (extended to
`(organizationId, automationType, sourceType, sourceId, policyVersion, occurrenceKey)`).

No external broker is introduced.

## Consequences

**Positive**
- Zero new runtime dependencies or failure surfaces — Postgres is already present and backed up.
- `SKIP LOCKED` gives safe concurrent claiming natively; no double-execution (paired with `@@unique([automationJobId, attemptNumber])`).
- The queue is transactional with the rest of the domain, enabling a future true transactional outbox (ADR-0004) behind the same table contract.
- Fully replaceable later: a broker can sit behind the `AutomationJob` contract without changing callers.

**Negative / trade-offs**
- Polling (the executor scans for due jobs each loop) is less efficient than a push broker — acceptable at this volume, and mitigated by the claim indexes (`[status, availableAt]`, `[status, nextAttemptAt]`, `[status, leaseExpiresAt]`).
- Very high throughput would eventually favor a broker; that threshold is far above current scale and is an explicit future decision, not this one.

## Alternatives considered

- **External broker (Redis + Bull/BullMQ):** rejected — unjustified new infrastructure, dependency, and ops burden for tens-of-jobs/day; nothing in the repo uses it.
- **In-memory queue in the web process:** rejected — non-durable, lost on restart, and cannot survive crashes (violates the crash-recovery requirement).

## Traceability

A2 (scheduling↔execution separation) · Implementation Plan **Determinations 6 & 7** ·
`RefreshJob` / email-outbox precedents.
