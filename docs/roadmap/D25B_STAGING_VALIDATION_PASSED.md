# D25b · Clean Staging Validation — PASSED (checkpoint)

> **The clean staging validation completed cleanly with the DE-4 fix merged. This is a checkpoint, not the
> rehearsal.** Per direction, stopping here — the D25b rehearsal requires separate authorization.
> 2026-07-21. Production untouched throughout.

---

## Preconditions
- DE-1, DE-2, DE-3, DE-4 all merged to `main` (DE-4 = `bfd9fd9`).
- Production sentinel in place + verified; staging **re-provisioned clean** (fresh build, nothing moved),
  updated to the merged engine (`bfd9fd9`).
- Prod baseline: `crowdexpanse-commercial` pid **299921**, restart_time **96**, health 200.

## Validation (corrected engine dry-run against staging — never prod)
Ran `deploy.mjs --dry-run --app-dir /opt/crowdexpanse/staging-commercial --pm2-app
crowdexpanse-commercial-staging --port 3040`. Resolved-context banner correctly showed the **staging**
target + test DB. Full state sequence passed:

| Check | Result |
|---|---|
| Resolved-context banner (fail-closed target) | ✅ Application = staging, DB = `…_test`, port 3040 |
| PRECHECK (lock, disk, target validity, identities) | ✅ prev + active resolved; migrated-target invariant ok |
| **BUILD** (relative distDir + generated deploy tsconfig) | ✅ **passes** — the DE-4 failure is gone |
| VERIFY_BUILD | ✅ BUILD_ID + manifests in `releases/<stamp>` |
| VALIDATE_SWAP_TARGET / VALIDATE_ROLLBACK_TARGET | ✅ |
| ASSERT_SINGLE_ACTIVE | ✅ `active=releases/20260721T004532Z` |
| DRY_RUN complete (stops before SWAP) | ✅ live server unchanged |

## Post-conditions verified
- **Build landed correctly** in `releases/<stamp>` (BUILD_ID + `release.json` + `types/`) — no nesting.
- **No leftover `tsconfig.deploy.json`** — the `finally` cleanup worked (success path).
- **Committed `tsconfig.json` + `next.config.mjs` untouched.**
- **History record persisted** to `deploy-history/<stamp>.json`.
- **Live symlink unchanged** (`.next → releases/20260721T004532Z`) — dry-run never swapped.
- **Second dry-run also clean** (dry-run is safely re-runnable).
- **Production untouched** — pid 299921 / restart 96 / health 200 (identical before/after); staging healthy.
- Dry-run residue cleaned; staging left with its single clean active release.

## Status
- **DE-4 fix validated end-to-end.** The full DE-1→DE-4 chain is merged and the clean staging validation
  passes.
- **STOP — checkpoint.** The D25b rehearsal
  (`Dry Run → Forced Failure → Rollback → Recovery → Second Dry Run → Normal Deployment → Smoke`, with §4a
  timings + §4b Go/No-Go) is a **separate operational milestone requiring its own authorization**. Not started.

---
*Stop point: clean staging validation PASSED. Awaiting separate authorization to begin the D25b rehearsal.*
