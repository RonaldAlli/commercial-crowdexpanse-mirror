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

## 6. Resolution — DE-2/DE-3 fixed on branch `fix/d25a-de2-de3-safety` (PENDING REVIEW)

Implemented as its own milestone (isolated branch, narrow scope, regression tests, full gate — no merge,
no validation re-run yet):

- **DE-2 (fail-closed CLI):** new pure `scripts/deploy/resolve-context.mjs`
  (`resolveDeployContext` + `argValue`). `--app-dir` (or `--app-dir=…`, or `--cwd`) is **required** — no
  production default; the path must resolve exactly to an app checkout; a `.production-instance`-marked
  target is refused without `--production` (and `--production` against an unmarked target is refused); any
  non-dry-run requires `--yes`. `deploy.mjs` uses it and prints a **resolved-context banner**
  (Application / Mode / Release / Database / PM2 / Port) before the state machine starts.
- **DE-3 (validate before build):** exported `assertMigratedTarget(appDir, nextLink)` runs **first in
  PRECHECK** — before any lock/releases dir is created — and again at SWAP (defense in depth). History is
  persisted **only if PRECHECK passed**, so a refused run leaves **zero residue** (verified on a temp
  target: real-dir `.next` → PRECHECK error, no `releases/`, no `deploy-history/`, no lock).
- **Sentinel + hygiene:** `.gitignore` now ignores `.production-instance` (a LOCAL per-instance marker,
  never committed) plus `releases/`, `deploy-history/`, `.deploy.lock/`.
- **Regression tests:** `resolve-context.test.mjs` (10 — `=`/space parsing, fail-closed missing target,
  exact-resolution, sentinel gating both directions, `--yes` gate, `--cwd`) + `ops-real-target.test.mjs`
  (4 — symlink ok / absent ok / real-dir throws / dangling throws) + engine ordering test (PRECHECK fail →
  no build, zero history). Gate: tsc 0; unit **69** files (deploy **30/30**); e2e 43; build:isolated ok.
- **Enablement (post-review, operational):** create `/opt/crowdexpanse/commercial/.production-instance`
  (one-time local marker) so the CLI hard-refuses accidental production targeting.

**Note:** during fix verification a smoke was (over-eagerly) pointed at the real prod checkout; it failed
safely at PRECHECK (no build/swap/restart; prod pid/restart/health unchanged) but left an empty
`releases/` + a history record — both removed, prod pristine. This drove the ordering + persist-gating
hardening above. Lesson reinforced: verify against throwaway fixtures, never the prod checkout.

---
*Stop point: DE-2/DE-3 implemented + fully gated on `fix/d25a-de2-de3-safety`. Awaiting review before
merge; only then the sentinel enablement + a clean staging validation from the beginning.*
