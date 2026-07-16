# ADR-0003 — Separate the immutable execution ledger from the mutable job

**Status:** Decision **accepted** within the FOUNDER RATIFIED Automation architecture
(2026-07-16). **Implementation PENDING FOUNDER APPROVAL FOR IMPLEMENTATION** (Phase 2.0.1).

## Context

The ratified architecture (A8, AU-8) requires an **immutable operational execution ledger**
that complements — never replaces — `ActivityLog`. Grounded precedent:

- `RefreshJob` (`lib/intelligence/refresh.ts`, `prisma/schema.prisma:386-416`) **folds the run result into the job row and UPDATES it**: created `RUNNING`, then updated to `SUCCEEDED`/`NOOP`/`FAILED` with counts and timings. It is one mutable row per run.
- That folding is incompatible with immutability: a row that is updated `RUNNING → SUCCEEDED` cannot be an immutable audit record.
- Crash recovery needs a place to hold in-progress state (a lease) that is *not* the immutable record.

## Decision

**Split the two concerns:**

- **`AutomationJob`** — the **mutable lifecycle / queue row**. Holds current `status`, `attempts`, `leaseExpiresAt`, `nextAttemptAt`. Updated as it moves through its lifecycle. This is where in-progress (`RUNNING` + lease) state lives.
- **`AutomationExecution`** — **insert-only, immutable**. Exactly one row per completed *or abandoned* attempt, written once inside the same `$transaction` that finalizes the job's status. Never updated, never deleted.

`FAILED` is therefore an **attempt-grain** outcome on the execution ledger; a job that can no
longer succeed ends at the **job-grain** terminal `DEAD_LETTERED`. A crash-abandoned attempt
is recorded by the reaper as an immutable execution row (`outcome=FAILED`,
`failureClass=UNKNOWN`) so the ledger stays complete.

## Consequences

**Positive**
- Genuine immutability (AU-8) — the audit ledger is append-only and tamper-evident.
- Clean crash recovery — the lease lives on the mutable job; the immutable ledger is never in a half-written state.
- The operator surface can distinguish "one attempt failed" (execution) from "this job needs a human" (`DEAD_LETTERED`).
- Two ledgers (execution ⟂ `ActivityLog`) with distinct purposes, per the ratified two-ledger model.

**Negative / trade-offs**
- Two tables and a join instead of one (more schema and slightly more write coordination) — justified by the immutability requirement; the finalize `$transaction` keeps them consistent.
- A small amount of denormalization (org id, type, policy version repeated on the execution) so each execution row is self-describing without reading the job — an intentional audit property.

## Alternatives considered

- **Fold result into the job (`RefreshJob` style):** rejected — cannot be immutable; violates A8/AU-8.
- **Immutable job + a separate mutable "attempt" table:** rejected — inverts the natural mutability (the job *is* the thing that changes state); this design puts mutability where change actually happens and immutability where the audit lives.

## Traceability

AU-8 (immutable execution ledger) · A8 · Implementation Plan **Determinations 2 & 3** ·
Schema Proposal §3–§4.
