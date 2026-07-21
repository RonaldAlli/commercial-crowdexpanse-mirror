# D25b · Staging Rehearsal — Results + Go/No-Go

> **The full D25b rehearsal executed end-to-end on the isolated staging instance. All steps passed; the
> forced failure auto-rolled-back with no manual intervention. Timings captured; Deployment Baseline
> drafted. STOP — production migration is NOT authorized (Go/No-Go below shows No-Go pending the migration
> gates).** 2026-07-21. Production untouched throughout.

---

## Sequence executed (staging `crowdexpanse-commercial-staging`, 127.0.0.1:3040, test DB)

| # | Step | Result |
|---|---|---|
| 1 | **Dry Run** | ✅ full non-mutating validation; live symlink unchanged; no leftover config |
| 2 | **Forced Failure** (health returns non-`ok`) | ✅ `SWAP → RESTART → VERIFY_RUNTIME error` |
| 3 | **Automatic Rollback** | ✅ `ROLLBACK done` — `.next` repointed to the previous release, no manual step |
| 4 | **Recovery Verification** | ✅ previous release serving, health `ok`, single-active invariant holds |
| 5 | **Second Dry Run** | ✅ clean + re-runnable after restoring good source |
| 6 | **Normal Deployment** | ✅ `DEPLOYED — serving mpsEWvDMJqyDqvwVM3zH4`; atomic swap |
| 7 | **Smoke** | ✅ `SMOKE ok` (~0.3 s) |

## §4a timings captured (see [Deployment Baseline](./DEPLOYMENT_BASELINE.md))
- **Forced-failure / rollback:** detect ~10.7 s (health-verify timeout) · roll back ~1.8 s · recovery ~1.8 s
  · app-unavailable ~12.8 s (worst case).
- **Normal deploy:** change window ~1.7 s · pm2 restart ~0.8 s · verify ~0.9 s · smoke ~0.3 s ·
  app-unavailable ~1.3 s (restart only) · full ~106 s (build-dominated).
- Every run persisted a `deploy-history/<stamp>.json`; `tsconfig.deploy.json` cleaned each time; no stale
  lock on the clean runs.

## Observations (staging only; not production issues)
1. **Stale lock after a KILLED deploy.** When a deploy process was hard-killed mid-rollback (my command
   timeout), the `finally` that releases `.deploy.lock` was bypassed → stale lock blocked the next deploy
   until removed. **Candidate follow-up (D25c?):** a lock staleness/PID guard or SIGTERM handler so a killed
   deploy self-heals. Non-blocking for the rehearsal; documented in the Deployment Baseline anomaly guide.
2. **Prod graceful recycle 96→97** occurred during the rehearsal — the pre-existing D24 memory-recycle
   (new pid, health 200), unrelated to the rehearsal (which touched only staging). Per the Operations
   Baseline, restart count is not a release metric.

## §4b Go / No-Go — for the PRODUCTION migration (objective; any ✗ ⇒ No-Go)
| # | Check | Status |
|---|---|---|
| 1 | Staging rehearsal passed end-to-end | ✅ |
| 2 | Rollback rehearsal passed (auto, no manual intervention) | ✅ |
| 3 | Deployment + rollback timings recorded (§4a) | ✅ |
| 4 | Deployment Baseline drafted | ✅ |
| 5 | Rollback assets verified | ✅ staging (previous release retained); **prod `.next.premigration` created at migration time** |
| 6 | Restore-verified DB backup taken | ⏳ **at migration time** (prod) |
| 7 | Maintenance / quiet window approved | ⏳ **founder, at migration time** |
| 8 | Founder authorization (this specific migration) | ⏳ **NOT given — the stop point** |

**Verdict: NO-GO for production migration** — items 6–8 are the migration-time gates and remain open by
design. The rehearsal itself (1–4) is **GO**; the engine is proven.

## Status
- **D25b rehearsal COMPLETE + PASSED.** The Deployment Engine is validated end-to-end (atomic deploy +
  automatic rollback + recovery) on an isolated staging clone, with production never touched.
- **STOP.** The **production host migration** (D25b §3) requires its own authorization + the §4b migration
  gates (6–8). Not started.

---
*Stop point: rehearsal passed; Deployment Baseline drafted; Go/No-Go = No-Go for prod migration (gates 6–8
open by design). Awaiting separate authorization for the production migration. Staging clean + healthy;
prod untouched.*
