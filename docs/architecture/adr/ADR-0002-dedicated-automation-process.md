# ADR-0002 — A dedicated `crowdexpanse-automation` PM2 process

**Status:** Decision **accepted** within the FOUNDER RATIFIED Automation architecture
(2026-07-16). **Implementation PENDING FOUNDER APPROVAL FOR IMPLEMENTATION** (Phase 2.0.1).

## Context

The Automation domain requires **out-of-request execution** — the scheduler, executor, and
reaper must run independently of any HTTP request. Grounded repository facts:

- `ecosystem.config.js` defines **exactly one** PM2 app, `crowdexpanse-commercial` (`instances: 1`, `exec_mode: "fork"`, `next start -p 3030`), with **no `cron_restart`**.
- There is **no worker, background, queue, or cron process** anywhere. Every currently "async-looking" operation — intelligence refresh (`lib/intelligence/refresh.ts`), projections, underwriting decisions — runs **synchronously, in-request, single-process**.
- The email `drain()` (`lib/email/message-service.ts:97`, "the future cron target") is built but **unscheduled**.

Out-of-request execution is therefore **net-new infrastructure with no existing pattern to
copy** — the single most consequential constraint of the phase.

## Decision

Introduce **one dedicated PM2 process, `crowdexpanse-automation`** (`instances: 1`,
`exec_mode: "fork"`), added to `ecosystem.config.js`. It runs three cooperating loops,
**separated in code** (per A2) but **co-located in one process** for operational simplicity:

1. **Scheduler** — decides *when*: enumerates organizations, creates/enqueues per-org jobs, seeds the next periodic occurrence, supersedes stale duplicates.
2. **Executor** — decides *whether/what* and does it: claims due jobs (ADR-0001), evaluates policy, runs the read-only proof job, writes the immutable execution, finalizes the job.
3. **Reaper** — recovers stale `RUNNING` leases.

The web process is **not** modified to execute jobs.

## Consequences

**Positive**
- True separation of scheduling from execution (A2), independent of web traffic.
- Idle-safe and separable: `pm2 stop crowdexpanse-automation` instantly neutralizes all automation with zero effect on the web app or domain data — the primary rollback (see Rollout Plan §5).
- Single instance + `SKIP LOCKED` claiming keeps concurrency correct without leader election.
- The three loops can later be split into separate processes without changing their contracts.

**Negative / trade-offs**
- A second process to deploy, monitor, and reason about — genuinely new ops surface (mitigated: single instance, idle-safe, kill-switchable, ADMIN health endpoint).
- Co-locating the loops trades strict process-level isolation for simplicity; acceptable at this scale and explicitly reversible.

## Alternatives considered

- **In-request poller inside the web app:** rejected — cannot run without HTTP traffic, couples execution to the web lifecycle, and violates A2.
- **External scheduler/broker (Redis, a managed queue):** rejected — see ADR-0001; unjustified new infra.
- **System cron invoking a one-shot script:** rejected — coarse-grained, no lease/heartbeat model, poor observability, and still net-new; a supervised long-lived PM2 loop is cleaner and matches the existing PM2 operational model.

## Traceability

A2 (scheduling↔execution separation) · Implementation Plan **Determination 6** ·
Rollout Plan §3 (automation process starts **last**) & §5 (kill-switch rollback).
