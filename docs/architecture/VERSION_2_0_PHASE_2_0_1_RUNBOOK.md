# Version 2.0 · Phase 2.0.1 — Automation Operations Runbook

> **Status: PENDING FOUNDER ACCEPTANCE.** Implementation is complete on
> `feature/v2.0.1-automation-foundation`; **no production change has occurred.** Prod remains at
> **26 migrations**, one PM2 app (`crowdexpanse-commercial`), and the automation process is **not
> running**. This runbook is the operator procedure for *when* the phase is accepted and rolled
> out — it is not an instruction to act now.
>
> **Companions:** [Rollout Plan](./VERSION_2_0_PHASE_2_0_1_ROLLOUT_PLAN.md) ·
> [Implementation Plan](./VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md) ·
> [Acceptance Criteria](./VERSION_2_0_PHASE_2_0_1_ACCEPTANCE_CRITERIA.md) ·
> [Test Plan](./VERSION_2_0_PHASE_2_0_1_TEST_PLAN.md) · [Schema Proposal](./VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md) · [ADRs](./adr/).

---

## 0. Mental model (read first)

The automation foundation is **two separable things**:

1. **Schema (migration 27)** — additive tables `AutomationJob` (mutable queue/lifecycle) and
   `AutomationExecution` (insert-only attempt ledger), seven enums, additive `ActivityLog`
   columns, `Organization` back-relations. Applying it changes **nothing** about behavior; the
   new tables sit empty.
2. **The automation process (`crowdexpanse-automation`)** — a second PM2 app running the
   scheduler + executor + reaper loops. It is **declared but inert**: it is not started on
   deploy, and even when started it does **no work** until the `AUTOMATION_SCHEDULER_ENABLED`
   kill-switch is set to `"1"`.

The only automation wired in 2.0.1 is a **read-only closing-readiness observation**. It reads the
shared `projectClosingBadges` projection and records an execution row. It **never** writes
Closing/Escrow/Financing/Assignment/Underwriting/stage/checklist/waiver/PAID state:
`producedDomainEffect` is always `false`. There is no AI, no external communication, and no
cross-org access anywhere in the path.

**Two independent OFF switches** protect production: (a) the process is not started; (b) the
kill-switch is `0`. Turning automation on is a deliberate, reversible, ADMIN/operator action —
never a side effect of a deploy.

---

## 1. Enabling automation (dark → observing)

Prerequisite: migration 27 applied (`prisma migrate deploy`; verify with `prisma migrate
status` → "up to date"), and the web app healthy. See the Rollout Plan §3 for the full deploy
order — the automation process starts **last**.

Enable in stages so you can watch each step:

1. **Start the process with the kill-switch still OFF** (proves the process is healthy and
   truly inert):

   ```bash
   pm2 start ecosystem.config.js --only crowdexpanse-automation
   pm2 logs crowdexpanse-automation --lines 40   # expect: "scheduler=off · handlers=1"
   ```

   With `AUTOMATION_SCHEDULER_ENABLED=0` (the committed default), the runtime logs that it
   started, enumerates nothing, and claims nothing. `AutomationJob`/`AutomationExecution` stay
   empty. Leave it here as long as you like.

2. **Flip the kill-switch ON** to begin observing. Set `AUTOMATION_SCHEDULER_ENABLED=1` in the
   process env (edit `ecosystem.config.js` on the host **or** pass it inline) and restart:

   ```bash
   AUTOMATION_SCHEDULER_ENABLED=1 pm2 restart crowdexpanse-automation --update-env
   pm2 logs crowdexpanse-automation --lines 40   # expect: "scheduler=on · handlers=1"
   ```

   The scheduler now seeds one closing-readiness job per in-flight opportunity per UTC hour
   bucket; the executor claims and runs them; the reaper recovers any stale lease. Every run
   records an immutable `AutomationExecution` with `outcome=SUCCEEDED`/`NOOP` and
   `producedDomainEffect=false`.

3. **Confirm it is observing, harmlessly** (see §2). The success signal is execution rows
   accumulating with **zero** domain change.

---

## 2. Monitoring

### Health endpoint (ADMIN-only, org-scoped)

```
GET /api/automation/health      # requires an ADMIN session; returns 404 to non-admins
```

Returns aggregate counters only (no per-row payloads, no secrets): `queueDepth`,
`oldestPendingAgeMs`, `running`, `staleLeases`, `retryScheduled`, `deadLettered`,
`windowExecutions`, `succeeded`/`failed`/`noop`, `successRate`, `avg`/`p95DurationMs`,
`policyDenials`, `orgScopeViolations`. It is scoped to the caller's organization.

**Watch for:** `deadLettered > 0` (a job exhausted retries — investigate, then §3),
`staleLeases > 0` sustained (executor may be down — reaper should clear it), `orgScopeViolations
> 0` (should be **zero**; any non-zero value is a hard incident — go to §5),
`oldestPendingAgeMs` climbing (executor not draining the queue).

### Ledger inspection (read-only SQL)

```sql
-- Recent attempts (proof job must always show producedDomainEffect = false)
SELECT "automationType", outcome, "policyDecision", "producedDomainEffect", "failureClass", "createdAt"
FROM automation_executions ORDER BY "createdAt" DESC LIMIT 20;

-- Any dead-lettered jobs
SELECT id, "automationType", "sourceId", attempts, "maxAttempts", "lastFailureClass"
FROM automation_jobs WHERE status = 'DEAD_LETTERED';

-- INVARIANT CHECK — this must return zero rows, always:
SELECT count(*) FROM automation_executions WHERE "producedDomainEffect" = true;
```

### PM2

```bash
pm2 status                                   # crowdexpanse-automation should be "online"
pm2 logs crowdexpanse-automation --lines 100 # operational logs (claims/leases live here, NOT in ActivityLog)
```

Operational mechanics (claims, leases, retries, polling) are intentionally **not** written to
`ActivityLog` — only business observations are, and only when
`AUTOMATION_EMIT_OBSERVATION=1`. Queue/retry noise lives in the execution ledger and PM2 logs.

---

## 3. Requeuing a dead-lettered job (ADMIN operator exception)

A `DEAD_LETTERED` job has exhausted its attempts. Requeuing grants **one** more attempt and
returns it to `QUEUED`; a subsequent claim creates a **new** attempt row. It **never** mutates
or deletes any prior `AutomationExecution` — the ledger stays immutable.

- Authorization: `canRequeueAutomationJob(role)` — **ADMIN only**.
- Service: `requeueDeadLetteredJob(organizationId, jobId, now)` (org-scoped; a cross-org id is
  refused). No UI ships in 2.0.1 — requeue is invoked by an ADMIN via a server action / REPL in
  the app context; do not hand-edit rows.

Before requeuing, read the dead-letter's last execution `error`/`failureClass` to confirm the
cause is transient. A `VALIDATION_FAILURE`/`PERMISSION_FAILURE` will just dead-letter again.

---

## 4. Disabling automation (reversible, no data loss)

Two levels, least-invasive first:

1. **Pause work (kill-switch):** set `AUTOMATION_SCHEDULER_ENABLED=0` and restart. The process
   stays online but seeds/claims nothing. In-flight state is untouched.

   ```bash
   AUTOMATION_SCHEDULER_ENABLED=0 pm2 restart crowdexpanse-automation --update-env
   ```

2. **Stop the process entirely:**

   ```bash
   pm2 stop crowdexpanse-automation      # or: pm2 delete crowdexpanse-automation
   ```

Either is safe at any time: the executor loop drains its in-flight iteration on `SIGTERM`
(graceful stop), and any lease it was holding is recovered by the reaper (or on next start).
Because automation owns **no** authoritative state, disabling it changes nothing about the
business domain.

---

## 5. Rollback

Because migration 27 is **additive**, the web app never depends on the automation tables, and
automation writes no domain state, rollback is low-risk:

1. **Stop automation:** `pm2 delete crowdexpanse-automation`.
2. **Revert the web app** to the prior release if needed (standard deploy rollback); the app is
   unaffected by the automation tables' presence.
3. **Leave migration 27 in place.** The empty additive tables are inert and harmless; there is
   no need to drop them, and dropping is a destructive operation that is explicitly out of
   scope. If a full teardown is ever required, it is a separately-reviewed migration.

**Incident escalation:** any `producedDomainEffect = true` row, any `orgScopeViolations > 0`, or
any evidence of a domain write attributed to automation is a **stop-the-line** event: disable
automation (§4), preserve the execution ledger (do not delete rows — it is the audit record),
and review before re-enabling.

---

## 6. Invariants (must always hold)

- `producedDomainEffect` is **`false`** for every execution in 2.0.1.
- No automation path writes Closing/Escrow/Financing/Assignment/Underwriting/stage/checklist/
  waiver/PAID state, mutates an immutable snapshot, or overwrites `ActivityLog` history.
- Automation acts as the **AUTOMATION principal** (`automation:<type>`), never a user;
  `actorId` is always `null` on automation-attributed rows.
- Every execution is preceded by the **mandatory policy gate**; `perform()` runs only on
  `ALLOW`.
- No cross-org read or write; no external communication; no AI.
- `lib/analysis.ts` (the underwriting kernel) is unchanged and is never an input to, or output
  of, any automation.
