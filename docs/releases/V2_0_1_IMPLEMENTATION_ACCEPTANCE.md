# Version 2.0 · Phase 2.0.1 (Automation Foundation) — Implementation Acceptance Package

> **Status: ⏳ PENDING FOUNDER ACCEPTANCE.**
> - **Implementation complete on branch:** `feature/v2.0.1-automation-foundation` (pushed to
>   gitea `origin` + `github` mirror; all three tips at **`040a26b`**).
> - **NOT merged, NOT deployed, NOT applied to production.** Prod remains at **26 migrations**,
>   one PM2 app (`crowdexpanse-commercial`), the automation process **not running**.
> - **Frozen refs untouched:** `main` @ `1760c9a`, `release/1.3` @ `d341c0a`, `release/1.4` @
>   `ece38aa`, `v1.3.0` @ `bca39f4`, `v1.4.0` @ `c1133ad`.
> - **D15 (deprecated `DealAnalysis` removal) untouched.**
>
> This package requests Founder acceptance of the *implementation*. Per the two-step process
> ([release-acceptance-process](../architecture/)), acceptance authorizes the separate rollout;
> only after explicit approval do we merge, deploy, apply migration 27, and (as a deliberate,
> kill-switched, later step) start the automation process.

---

## What was built

The **Automation Foundation**: a generic, org-scoped, database-backed job spine (schedule →
queue → **mandatory policy** → immutable execution ledger → best-effort audit → retry/
dead-letter/crash-recovery), plus **exactly one** wired automation — a **read-only
closing-readiness observation** that reads the shared `projectClosingBadges` projection (TX-6)
and **produces no domain effect**. The spine is designed for future mutating automations, but
2.0.1 ships only the harmless proof.

**Idle-safe by construction — two independent OFF switches:** the automation process is not
started on deploy, and even when started it does nothing until `AUTOMATION_SCHEDULER_ENABLED=1`.

---

## Commit sequence (branch `feature/v2.0.1-automation-foundation`)

| # | Commit | Contents |
|---|---|---|
| 1 | `2c876b8` | Automation schema + additive **migration 27** (2 tables, 7 enums, additive `ActivityLog.actorType`/`automationExecutionId`, `Organization` back-relations). Additive-only; no destructive op. |
| 2 | `8326012` | Pure contracts + unit tests: `types`, `lifecycle`, `policy`, `idempotency`, `health` (4 added to the CRITICAL ≥90%-branch set). |
| 3 | `b432f8b` | Job repository + **immutable** execution ledger (`enqueueJob` idempotent, `claimDueJobs` `FOR UPDATE SKIP LOCKED`, `finalizeJob` one-transaction insert-only, operator requeue). |
| 4 | `1ded6cf` | Executor (policy-gated), reaper (stale-lease recovery), scheduler (org-enumerating seeder), inert registry, PM2 runtime entrypoint (kill-switch, graceful drain, no import side effects). |
| 5 | `a2fd775` | Automation Principal (`automation:<type>`, never a user) + best-effort `ActivityLog` linkage (`actorType=AUTOMATION`, `actorId=null`, one-way link preserving ledger immutability). |
| 6 | `4668582` | **The read-only proof automation**: `proof-observer` (consumes the shared closing projection), registry wiring, `fetchAutomationHealth`, ADMIN-only `/api/automation/health`, `AUTOMATION` RBAC + `canRequeueAutomationJob`, inert `crowdexpanse-automation` PM2 app, e2e sections 24–31. |
| 7 | `5657f5a` | Operations runbook + tech-debt (D17 → INCURRED/pending). |
| — | `040a26b` | **Defect fix** (found in the final audit): Commit 2 had written a literal NUL (0x00) byte into the `jobIdentityKey` separator, making the source a binary blob; replaced with the `"\0"` escape. Runtime string byte-for-byte identical (single NUL char) — no behavioral change; source is now clean text. |

---

## Final validation gate — all green

| Check | Result |
|---|---|
| `prisma format` | clean (idempotent; no schema change) |
| `prisma validate` | valid |
| `prisma migrate status` (TEST DB) | **27 migrations**, up to date, no drift |
| `tsc --noEmit` | 0 errors |
| `run-unit-tests.mjs` | 54 files; all critical branch ≥90%; **overall branch 93.0%** ≥80% |
| `e2e-all` (TEST DB) | **39/39 scripts** pass, incl. `e2e-automation` (**98 assertions**) |
| Secret scan (branch diff) | clean |
| AI / provider / network scan | **none** — no AI deps, no provider imports, no `fetch`/network calls, no prompts anywhere in `lib/automation`, `app/api/automation`, or the runtime |
| `lib/analysis.ts` (underwriting kernel) | **unchanged** vs `main` |
| Isolated build (`build:isolated`) | green; `/api/automation/health` route compiled to `.next-isolated`; **prod `.next` mtime unchanged** |

### Proof-automation behavior proven (e2e sections 24–31)
ALLOW / NO_ACTION / DENY / STALE_CONTEXT policy outcomes; missing-source and **cross-org**
source both fail closed (NO_ACTION, no cross-org read); **byte-for-byte domain-no-change** over
a real executor run (opportunity/escrow/financing/assignment/checklist/AUTOMATION-activity
snapshot identical before/after); `producedDomainEffect=false` in the ledger; AUTOMATION-principal
attribution (never a user); seeder scoped to in-flight stages, idempotent per UTC hour bucket,
never seeds out-of-scope; org-scoped health (a fresh org sees none of another's automation).

---

## Production-safety evidence (prod verified read-only, untouched)

| Assertion | Evidence |
|---|---|
| Prod checkout on `main`, clean | `/opt/crowdexpanse/commercial` @ `1760c9a`, working tree clean, no `lib/automation` |
| Prod DB at 26 migrations | `SELECT count(*)` on `_prisma_migrations` = **26** |
| Migration 27 NOT applied to prod | no `%automation%` migration row; `automation_jobs`/`automation_executions` = `null` (absent); `activity_log.actorType`/`automationExecutionId` absent |
| Automation process NOT running | `pm2 jlist` → `crowdexpanse-commercial` online; **no** `crowdexpanse-automation` |
| Prod web healthy | `GET /api/health` → `{"status":"ok"}` |
| New endpoint not live in prod | `GET /api/automation/health` → 307 (auth redirect; route not deployed) — confirms feature is not live |

---

## Safety invariants (hold by construction; proven in tests)

- `producedDomainEffect` is **`false`** for every 2.0.1 execution.
- No automation path writes Closing/Escrow/Financing/Assignment/Underwriting/stage/checklist/
  waiver/PAID state, mutates an immutable snapshot, overwrites `ActivityLog` history, reads or
  writes across orgs, sends external communications, or uses AI.
- Automation acts as the AUTOMATION principal, never impersonates a user, and `actorId` is
  never used for automation identity.
- The mandatory policy gate precedes every `perform()`; `perform()` runs only on `ALLOW`.
- `lib/analysis.ts` is unchanged and is never an input to or output of automation.

---

## Deferred (recorded as D17; none blocks the read-only proof phase)

Event-driven outbox triggering (→ 2.0.2), a hard per-org concurrency cap + in-flight
cancellation, the shared `AutomationExecution`/`ActivityLog` composite index (behind the same
benchmark gate as TX-A/TL-9/LB-8), DB-backed configurable policies (code in 2.0.1), and the
reserved `AutomationExecution.activityLogId` (one-way link preserved).

---

## Requested decision

**Accept the Phase 2.0.1 implementation.** On acceptance, the separate rollout (Rollout Plan §3,
Runbook §1) may proceed: FF-merge to `main`, dual-push, `prisma migrate deploy` (26 → 27), then
— as a later, deliberate, kill-switched step — start `crowdexpanse-automation` dark → observing.
No merge, deploy, migration, or process start will occur before that explicit approval.
