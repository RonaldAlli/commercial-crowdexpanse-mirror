# D25b · Production Migration Package — for review (cutover NOT authorized)

> **Everything needed to authorize the one-time production host migration, assembled for review. This is a
> PACKAGE, not an execution. No production change has been made. Cutover requires explicit founder
> authorization + the open Go/No-Go gates.** 2026-07-21. Prepared after the passed staging rehearsal.

---

## 1. Restore-tested production backup — ✅ CONFIRMED
- Fresh backup **`20260721-073846Z`** taken now (read-only `pg_dump`).
- **Restore Test: PASS** — restored to `commercial_restore_verify`, **tables=13, counts=MATCH, docs=OK**.
- Retained: `/opt/crowdexpanse/backups/commercial/adhoc/20260721-073846Z`.
- Off-site R2 mirror **SKIPPED** (R2 not configured — the known **D4** item). The migration is **code/layout
  only, no schema change**, so the local restore-verified dump is the relevant safety net; enabling the R2
  mirror remains a separate D4 task.

## 2. Maintenance window — RECOMMENDATION (founder selects)
The cutover's only disruptive moment is a **`pm2 stop`/`start` bracket of seconds** (§4 step 3). Recommend:
- A **low-traffic window** (the app's quiet hours).
- **Avoid coinciding with a D24 memory-recycle** if predictable; a recycle during the window is harmless
  (health returns fast) but adds log noise.
- Operator (`deploy`) present to watch the settle window. Expected user-visible impact: a few seconds,
  comparable to the ~1.3 s restart measured in the rehearsal plus the manual `mv`/`ln` (still seconds).

## 3. Production Go/No-Go — current status (§4b)
| # | Check | Status |
|---|---|---|
| 1 | Staging rehearsal passed end-to-end | ✅ (2026-07-21) |
| 2 | Rollback rehearsal passed (auto, no manual intervention) | ✅ |
| 3 | Deployment + rollback timings recorded | ✅ ([Deployment Baseline](./DEPLOYMENT_BASELINE.md)) |
| 4 | Deployment Baseline drafted | ✅ |
| 5 | Rollback assets verified | ✅ plan retains `.next.premigration` (step 3) + release #1 |
| 6 | Restore-verified DB backup taken | ✅ `20260721-073846Z` (local; R2 mirror = D4) |
| 7 | Maintenance / quiet window approved | ⏳ **founder** |
| 8 | Founder authorization (this migration) | ⏳ **NOT given — the stop point** |

**Verdict: NO-GO until 7 + 8.** Everything else is green.

## 4. Exact migration plan (reversible) — run as `deploy`, never root

**Current prod facts (read live):** `.next` = **173 MB real dir**, BUILD_ID **`AKUhg2gFVCyjthMDVFvL3`**;
pm2 `crowdexpanse-commercial` = `next start -p 3030`, cwd `/opt/crowdexpanse/commercial`, online; disk **30 GB**
free; `releases/` will be same-filesystem (rename-atomic). *(Note: the running build `AKUhg2…` predates the
current `main`; the migration changes LAYOUT only — prod keeps serving `AKUhg2…` until a separately-authorized
deploy builds a new release.)*

```
STAMP=$(date -u +%Y%m%dT%H%M%SZ)                       # e.g. 20260721T0900Z
cd /opt/crowdexpanse/commercial

# 0. Record: BUILD_ID (expect AKUhg2gFVCyjthMDVFvL3), `readlink .next` (expect: not a link), pm2 online.

# 1. STAGE (no live change — COPY, never move):
mkdir -p releases
cp -a .next "releases/$STAMP"                          # current live build → release #1
printf 'pre-migration-AKUhg2gFVCyjthMDVFvL3' > "releases/$STAMP/.release-id"
#   backfill releases/$STAMP/release.json { releaseId, buildId:AKUhg2gFVCyjthMDVFvL3, commit:"pre-migration",
#   builtAt, nodeVersion, schemaVersion:<latest migration>, stamp:$STAMP, artifacts:[...] }

# 2. VERIFY: releases/$STAMP/BUILD_ID == AKUhg2gFVCyjthMDVFvL3; build-manifest + prerender-manifest present.

# 3. CUTOVER (the single one-time non-atomic step, in the quiet window):
pm2 stop crowdexpanse-commercial
mv .next .next.premigration                            # keep the real dir for INSTANT revert
ln -s "releases/$STAMP" .next                          # .next is now a symlink
pm2 start crowdexpanse-commercial

# 4. ASSERT: .next is a symlink → releases/$STAMP with a valid BUILD_ID (single-active invariant);
#    pm2 online; curl /api/health == 200 "status":"ok"; BUILD_ID still AKUhg2gFVCyjthMDVFvL3; /login 200/redirect.

# 5. SETTLE: short observation vs the Operations Baseline (health, clean error log, restart character).
```

**REVERT (at any point — the real dir survives the whole procedure):**
```
pm2 stop crowdexpanse-commercial
rm .next                                               # remove the symlink
mv .next.premigration .next                            # restore the original real dir
pm2 start crowdexpanse-commercial                      # verify health
```

**POST-SUCCESS (after the settle window):**
- Prune `.next.premigration` + the **3 legacy `.next.rollback-*`** dirs (bounded retention).
- Update the [Operations Baseline](./OPERATIONS_BASELINE.md) (remove the transient "Could not find a
  production build" note — eliminated by construction).
- The next code change ships via the **Deployment Engine** (`deploy.mjs --app-dir /opt/crowdexpanse/commercial
  --production --yes`), which the sentinel now guards.

## 5. Risk recap (from the initiative; all mitigated)
- One-time non-atomic cutover → seconds under `pm2 stop/start`, real dir retained for instant revert.
- Wrong/broken symlink → step 4 asserts the single-active invariant + BUILD_ID before declaring success.
- Disk → 30 GB free; 173 MB copy; legacy rollbacks pruned post-success.
- Ownership/root → run as `deploy`; guard stays.

## 6. Stop
Package complete. **Awaiting founder review + authorization (gates 7 & 8) to execute the cutover.** Until then
production is untouched; the running build `AKUhg2gFVCyjthMDVFvL3` continues to serve normally.

---
*Stop point: migration package prepared (backup restore-verified, plan exact, Go/No-Go = No-Go on gates 7–8).
No production change performed. Awaiting authorization for the cutover.*
