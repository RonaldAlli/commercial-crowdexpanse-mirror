# Architecture Decision Records — Automation domain (Version 2.0)

> These ADRs record the material infrastructure decisions for the **Automation** domain.
> The **decisions** sit within the **FOUNDER RATIFIED** [Automation Architecture
> Lock](../AUTOMATION_ARCHITECTURE_LOCK.md) (2026-07-16, invariants AU-1…AU-13). The
> **Phase 2.0.1 implementation** they inform is **PENDING FOUNDER APPROVAL FOR
> IMPLEMENTATION** — nothing here authorizes code, schema, migration, or production change.
>
> Governed by the [Phase 2.0.1 Implementation Plan](../VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md)
> (determinations D1–D12) and [Schema Proposal](../VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md).

| ADR | Decision | Traces to |
|---|---|---|
| [0001](./ADR-0001-db-backed-queue.md) | The `AutomationJob` table **is** the queue, claimed via `SELECT … FOR UPDATE SKIP LOCKED`; no external broker | A2 · D6/D7 |
| [0002](./ADR-0002-dedicated-automation-process.md) | A single dedicated `crowdexpanse-automation` PM2 fork process runs the scheduler/executor/reaper loops (out-of-request execution is net-new) | A2 · D6 |
| [0003](./ADR-0003-separate-immutable-execution-ledger.md) | Split the mutable `AutomationJob` lifecycle from an insert-only immutable `AutomationExecution` ledger (do not fold, `RefreshJob`-style) | AU-8 · A8 · D2/D3 |
| [0004](./ADR-0004-schedule-triggered-defer-transactional-outbox.md) | 2.0.1 is schedule-triggered; the transactional-outbox (domain-write-enrolled jobs) is designed but deferred to 2.0.2 | A6 · D6/D7 |
| [0005](./ADR-0005-automation-principal-activitylog-discriminator.md) | Represent the Automation Principal via an additive `ActivityLog.actorType` discriminator — never a system `User` row | AU-3 · D10 |

**Frozen baselines untouched:** V1.3 (`v1.3.0`) and V1.4 (`v1.4.0`).
