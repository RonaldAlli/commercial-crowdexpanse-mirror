# D25 — Deployment Engine · Acceptance & Close-out

> **D25 ACCEPTED · PRODUCTION VERIFIED · CLOSED — 2026-07-21.** The Deployment Engine is live in production
> (symlink+`releases/` model); the migration cutover succeeded and the observation window confirmed
> stability. No rollback required. Evidence below is from the actual run, not assumptions.

---

## 1. Observation summary (post-cutover)
- **Duration:** 1508 s (~25 min), completed as planned.
- **Health:** **146/146 samples OK, 0 not-ok**; DB latency 1.2–36 ms (normal).
- **PM2:** `status=online`, `restart_time` 97→97 (**no restarts**), `unstable_restarts=0`, uptime continuous
  from the cutover.
- **D24 memory-recycle:** **none occurred** during the window. Restart-through-symlink is nonetheless
  proven — the cutover's own `next start` (the currently-running process) booted cleanly **through the
  symlinked `.next`**; a future recycle performs the identical operation.
- **Error log:** last write **2026-07-20 02:48:55Z** (before the cutover) — **zero new errors** the entire
  time. The 16 historical "Could not find a production build" lines are the 2026-07-20 in-place-rebuild
  incident D25 fixes — *not* from this migration.
- **Final production state:** `.next` → **symlink** `releases/20260721T110934Z`; BUILD_ID
  `AKUhg2gFVCyjthMDVFvL3` (continuous — layout-only); `/api/health` 200 `status:ok`, `/login` 200, `/` 307.

## 2. Migration record (recap)
Start 11:09:33Z; cutover **11:10:11Z → 11:10:14Z (~3 s)**. STAGE (`cp -a .next → releases/20260721T110934Z`
+ backfilled markers) → VERIFY → CUTOVER (`pm2 stop` → `mv .next .next.premigration` → `ln -s` → `pm2 start`)
→ ASSERT (single-active + health + BUILD_ID continuity) — all passed. Restore-verified backup
`20260721-073846Z`. `.next.premigration` + legacy `.next.rollback-*` **retained** (revert available;
prune is deferred housekeeping).

## 3. Acceptance
| Criterion | Status |
|---|---|
| Production stable (25-min observation, health + pm2) | ✅ |
| Rollback **not** required | ✅ |
| Deployment Baseline confirmed (measured on staging; prod behaved consistently) | ✅ [Deployment Baseline](./DEPLOYMENT_BASELINE.md) |
| Migration package complete + executed | ✅ [package](./D25B_PRODUCTION_MIGRATION_PACKAGE.md) |
| No new errors / transient "production build" class eliminated | ✅ |

**D25 = ACCEPTED · PRODUCTION VERIFIED · CLOSED.** Frozen code baseline: `main cc98078` (all engine code
DE-1→DE-4 merged). Production now serves via the symlink model.

## 4. Retrospective

### What went well
- **Acceptance-first, gated discipline** held across the whole arc — design → engine → fixes → staging
  provisioning → rehearsal → migration package → cutover → observation, each a separate authorization.
- **State-machine engine** made behavior legible and testable; the sandbox + real-symlink tests caught the
  logic while staging caught the integration issues.
- **Reversibility everywhere** (cp-not-move, `.next.premigration`, restore-verified backup) meant the live
  cutover was a ~3 s, low-risk step with a one-command revert.
- **The migration validated D25's core promise in situ:** the first `next start` through the symlink emitted
  **zero** "production build" errors — the exact class the old in-place rebuild produced.

### DE-1 → DE-4 discoveries (found by validation, not shipped blind)
- **DE-1:** `NEXT_DIST_DIR` must be **relative** — an absolute value nested the build (Next joins distDir
  onto the project root). Found during staging provisioning.
- **DE-2:** CLI **fail-open to production** when `--app-dir=` wasn't parsed → a near-miss build in the prod
  checkout (safe: dry-run + invariant held; working tree remediated). Fixed to **fail-closed** + sentinel.
- **DE-3:** target validation ran **after** BUILD → moved to **PRECHECK** (fail before side effects), zero
  residue on refusal.
- **DE-4:** the `.next`-symlink **depth mismatch** vs `releases/<stamp>` (depth-2) broke the build's
  `.next/types` type-check. Corrected an earlier wrong hypothesis (contamination) via evidence; fixed with a
  **generated `tsconfig.deploy.json`** (Next's supported `typescript.tsconfigPath`), committed config untouched.

### Permanent safeguards added
- Fail-closed CLI targeting + **production sentinel** (`.production-instance`) + `--yes` for mutating ops +
  resolved-context banner.
- Single-active invariant (PRECHECK + SWAP); idempotency; deploy history; release manifest; guaranteed
  `tsconfig.deploy.json` cleanup; lock serialization.
- Engineering Baseline disciplines **#10** (never migrate build artifacts — fresh build only) and **#11**
  (verify against throwaway fixtures, never the prod checkout).
- New permanent **Deployment Baseline** (durations + rollback/recovery timings + artifacts + checklist).

### Remaining follow-up work
- **D26 — Interrupted-deployment recovery** (stale `.deploy.lock` after a hard-killed deploy): PID+age lock
  guard / SIGTERM handler / `deploy --recover`. **Now the next operational improvement** (eligible to start
  since D25 is closed).
- **D4** — off-site backup mirror (R2) still pending.
- Deferred housekeeping: prune `.next.premigration` + legacy `.next.rollback-*` after a longer soak.

---
*D25 closed 2026-07-21. Next code change ships via the engine:
`deploy.mjs --app-dir /opt/crowdexpanse/commercial --production --yes` (sentinel-guarded).*
