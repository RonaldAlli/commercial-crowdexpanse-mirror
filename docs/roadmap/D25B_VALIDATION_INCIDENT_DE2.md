# D25b · Environment-Validation Near-Miss + Defects DE-2 / DE-3

> **Reported transparently. During the DE-1 environment-validation dry-run, the engine accidentally
> targeted PRODUCTION due to a CLI arg-parsing defect (DE-2). Production SERVING was never affected
> (no swap, no restart, health 200 throughout); the working-tree pollution was remediated. No further
> engine runs until DE-2/DE-3 are fixed + reviewed.** 2026-07-20.

---

## 1. What happened

Command run (intended to target staging):
```
node scripts/deploy/deploy.mjs --dry-run --app-dir=/opt/crowdexpanse/staging-commercial \
     --pm2-app=crowdexpanse-commercial-staging --port=3040
```
`deploy.mjs`'s `argFor()` only recognises **space-separated** flags (`--app-dir <v>`), not `--app-dir=<v>`.
So `--app-dir=…` was ignored and `appDir` fell back to its **default of `/opt/crowdexpanse/commercial`
(production)**. The dry-run therefore ran PRECHECK+BUILD+VERIFY in the **production checkout**.

## 2. Impact — production serving UNAFFECTED; working tree polluted then remediated

**Not affected (the safety layers held):**
- It was a **dry-run** → the engine STOPPED before SWAP/RESTART. Production was never restarted
  (pid 299921, `restart_time` 96, health 200 — identical before, during, after).
- The **single-active invariant correctly FAILED** on production's real-dir `.next`
  (`.next is a real directory, not a symlink — host not migrated`), refusing to go further.
- The build wrote to a **subdir** (`releases/<stamp>` via NEXT_DIST_DIR), never the live `.next`.

**Polluted (all remediated):**
- `releases/r460725899559344-477721/` (a stray full build) — **removed**.
- `deploy-history/…json` (the run's persisted record, written in `finally`) — **removed**.
- `tsconfig.json` — `next build` auto-reformatted it (whitespace + arrays only) — **reverted** via
  `git checkout`. Prod checkout is clean again (only pre-existing `.next.rollback-*` remain), head `16808b1`.
- Deploy lock: released in `finally` (no stray `.deploy.lock`).

## 3. DE-1 status — the fix is VALIDATED as working

Despite running against the wrong dir, the corrected engine's `BUILD` + `VERIFY_BUILD` **passed** — the
build landed at `<checkout>/releases/<stamp>/BUILD_ID` with no nesting. That is the exact behaviour DE-1
fixes. **DE-1 is confirmed fixed.** A *clean* staging validation still needs to be re-run after DE-2.

## 4. New defects

### DE-2 (HIGH — safety): CLI targets PRODUCTION by default when the target arg isn't parsed
Two compounding problems in `deploy.mjs`:
1. `argFor()` supports `--flag value` but **not `--flag=value`** → the `=` form is silently dropped.
2. `appDir` **fail-OPENs to the production default** (`/opt/crowdexpanse/commercial`) when `--app-dir`
   is absent/unparsed — the most dangerous possible default.

**Fix (proposed, needs authorization):**
- Parse **both** `--flag value` and `--flag=value`.
- **Fail CLOSED:** remove the production default. Require an explicit `--app-dir`; if absent, error and
  exit. Targeting production must be explicit (e.g. an explicit prod path + a `--i-understand-production`
  style confirmation), never a fallback.

### DE-3 (MEDIUM): the target-validity/single-active check runs AFTER build, so a build executes in an invalid target
`ASSERT_SINGLE_ACTIVE` is a SWAP entry-criterion (and post-build in dry-run). So an invalid/unmigrated
target (real-dir `.next`) is only caught **after** the expensive, side-effecting `BUILD`. 

**Fix (proposed):** add a **PRECHECK-level** target validation (assert the target is a migrated
symlink-model app, or explicitly in a migration flow) so the engine fails **before** BUILD.

## 5. Recommendation + stop

- Treat **DE-2 (+DE-3)** as their own fix milestone (same discipline as DE-1): isolated branch → fix →
  regression tests (arg parsing incl. `=`, fail-closed on missing `--app-dir`, precheck target validation)
  → full gate → **review** → merge → then re-run the clean staging validation.
- **The D25b rehearsal remains blocked.** No further engine runs against any target until DE-2 is fixed.

---
*Stop point: incident remediated, DE-1 confirmed fixed, DE-2/DE-3 recorded. Awaiting direction on the
DE-2/DE-3 fix before any further engine execution.*
