# Version 2.0 · Phase 2.0.1 — Rollout Plan

> **Status: FOUNDER APPROVED FOR IMPLEMENTATION** (approved 2026-07-16 · Founder: Ronald Delroy Anthony Allicock). Implementation authorized on a feature branch; production rollout remains gated on separate Founder acceptance. **No
> deployment, migration, branch, build, or production change has occurred.** This describes
> the intended rollout *when the phase is authorized to build*. Prod remains at **26
> migrations**, one PM2 app, unchanged.
>
> **Companion:** [Implementation Plan](./VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md) ·
> [Schema Proposal](./VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md) ·
> [Acceptance Criteria](./VERSION_2_0_PHASE_2_0_1_ACCEPTANCE_CRITERIA.md) ·
> [Test Plan](./VERSION_2_0_PHASE_2_0_1_TEST_PLAN.md) · [ADRs](./adr/).
>
> **Frozen V1.3 (`v1.3.0`) / V1.4 (`v1.4.0`) untouched. D15 out of scope.**

---

## 0. What changes on the server

- **Schema:** one additive migration (26 → **27**) — `AutomationJob`, `AutomationExecution`, seven enums, additive `ActivityLog.actorType`/`automationExecutionId`, two `Organization` back-relations. No destructive change.
- **Runtime:** a **second PM2 app `crowdexpanse-automation`** (`instances: 1`, `exec_mode: "fork"`) is added to `ecosystem.config.js`, running the scheduler + executor + reaper loops. The existing `crowdexpanse-commercial` web app (`next start -p 3030` → nginx → :3030) is **unchanged in behavior**.
- **Endpoints:** one new ADMIN-only `GET /api/automation/health`. The unauthenticated `/api/health` liveness probe is unchanged.

The change is **idle-safe by construction**: even once the automation process is running, the
only proof job is a **read-only closing-readiness observation** — `producedDomainEffect` is
always `false`, and no Closing/Escrow/Financing/Assignment/Underwriting/stage/checklist/
waiver/PAID state is ever written.

---

## 1. Security constraints (binding during rollout)

- **Do NOT paste sudo passwords into Claude or the terminal history** — enter them only at the local prompt.
- **Do NOT create artificial production transactions** to force a job to run — verify against existing/empty state only (see §6).
- **Do NOT run Playwright fixture mutation against the production database.**
- Production verification is **read-only** (health endpoint, `migrate status`, process state, ledger inspection).

---

## 2. Pre-deploy checklist (all must pass on the feature branch)

1. `npm run typecheck` — clean.
2. `node scripts/run-unit-tests.mjs` — the four new pure modules (`policy`, `idempotency`, `lifecycle`, `health`) added to `CRITICAL` and at **≥90% branch**; overall ≥80%.
3. `npm test` (`e2e-all.mjs`) — `scripts/e2e-automation.mjs` **green against the `*_test` DB** (two-org isolation, full lifecycle, retry, dead-letter, crash recovery, idempotency, ActivityLog linkage). The `assertTestDatabase` guard must confirm a `_test` DB.
4. `prisma migrate status` — clean, no drift; the new migration is the only pending one.
5. `scripts/backup.sh adhoc` — healthy (5/6 local-OK, exit 3 accepted while R2 off-site is unprovisioned).
6. Both remotes updated (origin gitea + github); acceptance criteria reviewed; ADRs reviewed.

**Go/no-go gate:** all six green → proceed. Any failure → stop, fix, re-run.

---

## 3. Production rollout order (numbered — the automation process starts LAST)

Because the migration is additive and the automation process is separable, the safe order
brings up the schema and web app first, then starts automation **dark → observing**.

1. **Backup.** `scripts/backup.sh adhoc` on the host; confirm healthy.
2. **Merge + dual-push.** FF-merge the feature branch to `main`; push to origin (gitea) + github.
3. **Migrate.** `prisma migrate deploy` (26 → 27). Additive; safe on the `v1.4.0` baseline. The new tables sit **empty** — nothing writes them yet.
4. **Drift check.** `prisma migrate status` → "Database schema is up to date!".
5. **Build.** `npm run build` (gated by `predeploy-check`).
6. **Restart web.** `pm2 restart crowdexpanse-commercial --update-env`. Verify `/api/health` → `{ status: "ok", … }`. **At this point the automation feature is fully deployed but the automation process is NOT running — zero behavior change, zero rows written.**
7. **Start automation LAST.** `pm2 start ecosystem.config.js --only crowdexpanse-automation` (then `pm2 save`). The scheduler/executor/reaper loops begin; the proof job starts observing (read-only).
8. **Confirm.** Check `/api/automation/health` (ADMIN) and the `AutomationExecution` ledger (§6).

---

## 4. Staged enablement

| Stage | Action | Expected state | Behavior |
|---|---|---|---|
| **(a) Dark** | Steps 1–6: schema + code deployed, automation process **stopped** | Tables exist, empty; web healthy | **None** — indistinguishable from before, except the two empty tables |
| **(b) Observing** | Step 7: start `crowdexpanse-automation` | Jobs created `PENDING → … → SUCCEEDED`; immutable executions accrue | **Read-only** — closing observations only, `producedDomainEffect=false` |
| **(c) Confirmed** | Step 8: verify health + ledger | Queue draining, executions `SUCCEEDED`/`NOOP`, **zero** org-scope violations | Steady-state observation |

If anything looks wrong at (b) or (c), **`pm2 stop crowdexpanse-automation`** returns
instantly to stage (a) with zero effect on the web app or any domain data (§5).

---

## 5. Rollback strategy

Ordered least-invasive first — the design makes rollback cheap:

1. **Stop automation (primary).** `pm2 stop crowdexpanse-automation`. Instant; the web app and all domain data are untouched; the automation tables simply stop being written. This alone fully neutralizes the phase.
2. **Code rollback.** FF `main` to the prior commit + `pm2 restart crowdexpanse-commercial --update-env`. The additive `ActivityLog` columns are ignored by the reverted code (defaults preserve every row).
3. **Schema.** The additive migration **need not be reverted** — empty/unused tables and defaulted columns are harmless. Down-migrations are **not** the repo convention (additive-only discipline); if a schema rollback were ever required it would be a **separately reviewed forward migration**, never an ad-hoc `migrate reset`.

There is no scenario in which rolling back automation touches Closing, Underwriting, the PAID
gate, or any frozen artifact.

---

## 6. Production verification without artificial data

Prod may have few or zero in-flight opportunities. As with every prior slice, verify at the
**process / health / schema / ledger** level — **never by creating artificial transactions**:

- `prisma migrate status` → clean at migration 27.
- `pm2 status` → both `crowdexpanse-commercial` and `crowdexpanse-automation` **online**.
- `/api/health` → `{ status: "ok", dbMs, uptime, commit }`.
- `/api/automation/health` (ADMIN) → well-formed projection: queue depth, oldest-pending age, running, stale, retry-scheduled, **dead-letter = 0**, success/failure rate, duration p95, policy denials, **org-scope violations = 0**.
- `AutomationExecution` ledger → if any in-flight opportunity exists, one immutable `SUCCEEDED`/`NOOP` row per observed occurrence; if prod is empty, an **empty-but-correct** ledger and a scheduler that enqueues nothing is the expected, valid result (mirrors how prior slices were verified against empty prod).
- `pm2 logs crowdexpanse-automation` → clean loop cycles, no errors.

---

## 7. Observability during and after rollout

- **Automation health:** `/api/automation/health` (ADMIN JSON) — the pure `lib/automation/health.ts` projection.
- **Process:** `pm2 logs crowdexpanse-automation`, `pm2 monit`.
- **Web liveness:** `/api/health`.
- **Alerts to watch (from Determination 9):** any `ORG_SCOPE_VIOLATION`, `PERMISSION_FAILURE`, or `INVARIANT_VIOLATION` is a **stop-and-investigate** signal; a rising dead-letter count or retry storm warrants review.

**Post-deploy monitoring window:** watch the health projection and process logs for a full
scheduler/executor cycle interval (and at least one retry/backoff window) before declaring
the rollout stable. Keep `pm2 stop crowdexpanse-automation` as the instant kill-switch
throughout.

---

## 8. Docs sync on acceptance

On production acceptance, flip this package's status markers and update the Executive
Dashboard (Automation module row), Engineering Master Plan (Phase 2.0.1 → done), the Version
2.0 roadmap, and the Technical Debt register (record the deferrals from Implementation Plan
§17), per the standard release-acceptance process. No feature work lands on `release/1.3` or
`release/1.4`.

---

*End of Phase 2.0.1 Rollout Plan — FOUNDER APPROVED FOR IMPLEMENTATION.*
