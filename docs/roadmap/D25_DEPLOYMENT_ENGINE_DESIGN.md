# D25 — Deployment Engine · Design & Acceptance (Phases 1–4)

> **Status: DESIGN · PENDING FOUNDER REVIEW — no code, no implementation branch yet.** Acceptance-first
> per the [Engineering Baseline](./ENGINEERING_BASELINE.md). Scoped as the foundation of a long-term
> **Deployment Engine**, not only a `.next` fix. Implementation starts **only** after this is approved.

---

## Phase 1 — Deployment Architecture

### Current flow (the problem)
```
git merge → main    (in the production checkout /opt/crowdexpanse/commercial)
  → npm run build   ← rewrites the LIVE .next (173 MB real dir) in place, ~30–60 s
  → pm2 restart crowdexpanse-commercial   (next start -p 3030, cwd = checkout, reads .next)
Rollback: cp -a .next → .next.rollback-<stamp> BEFORE build; restore + restart on failure.
```
**Why the transient errors occur:** while `npm run build` is rewriting `.next`, the still-running
`next start` process reads a **partially-rebuilt `.next`** → `Error: Could not find a production build
in the '.next' directory` + `_error.js` missing. pm2 crash-retries the process (restart_time climbs;
16 retries observed on 2026-07-20) until the build finishes and the intentional restart lands. It
self-resolves, but the deploy window is noisy and briefly degraded.

### Target flow (atomic, zero partial-state)
```
build  → into a FRESH versioned dir  releases/<stamp>/dist   (NEXT_DIST_DIR; live release untouched)
verify → BUILD_ID present + required manifests + `next start` dry sanity
swap   → atomically repoint the `.next` SYMLINK → releases/<stamp>/dist   (ln -sfn == rename(2), atomic)
restart→ pm2 restart crowdexpanse-commercial   (only window of change ≈ the restart itself)
smoke  → health + key routes + BUILD_ID + migrations (as today)
rollback (auto on any failure) → repoint `.next` symlink → previous release + restart + re-smoke
retain → keep last N releases; prune older; prune old .next.rollback-* snapshots
```
**Key change:** `.next` becomes a **symlink** to a versioned release dir. The build never touches the
live release; the switch is a single atomic symlink repoint. There is **no moment** where `.next` is
absent or half-written, so the "Could not find a production build" class is eliminated by construction.

*(Alternative considered: build to `.next-new` then `mv .next .next-old && mv .next-new .next` — rejected:
the two-step rename has a sub-second window with no `.next`, so it's not truly atomic. Symlink switch is.)*

### Deployment Engine (the durable framing)
A `scripts/deploy/` module encapsulating **build → verify → swap → restart → smoke → auto-rollback**,
plus a **`releases/` version history** with a `current` pointer. Designed so these fit later **without
refactor**: version history (done by the release dirs), automatic rollback (symlink repoint), deployment
verification (the verify+smoke stages as hooks), **staging** (same engine, different target/port),
**canary/rolling** (engine deploys to a subset / repoints gradually). Today we implement only
atomic-single-node; the seams for the rest are reserved, not built.

### Failure paths
| Failure | Behavior | Live release |
|---|---|---|
| **Build failure** | abort before swap; delete the failed `releases/<stamp>`; report | untouched, still serving |
| **Verification failure** (missing BUILD_ID/manifest) | abort before swap; discard release | untouched |
| **Restart failure** (new release won't come up) | auto-rollback: repoint symlink → previous release + restart | restored |
| **Smoke failure** | auto-rollback: repoint → previous + restart + re-smoke; report | restored |

### Rollback guarantees
- **Maximum downtime:** only the pm2 restart window (~1–2 s). The build and verify happen off to the
  side; the swap is atomic; rollback is a symlink repoint + restart (seconds), not a 173 MB copy-restore.
- **Data safety:** code-only deploys touch **no schema/DB** (migrations remain a separate, gated step);
  the restore-verified DB backup is retained independently.
- **Build safety:** the currently-serving release is never modified during a build.
- **Rollback timing:** near-instant (repoint previous symlink + restart), and the previous release dir
  is retained for at least N deployments.

---

## Phase 2 — Acceptance Criteria (measurable, defined before code)
1. **Zero** `Could not find a production build` (or `_error.js` missing) errors in the app error log
   during a deploy.
2. **No pm2 crash-retry loop** from the rebuild — `restart_time` increases by exactly **1** (the single
   intentional restart), `unstable_restarts` stays 0.
3. Rollback remains available **and faster** — a documented one-command rollback to the prior release.
4. Deployment is **fully reversible** (previous release retained; symlink repoint proven).
5. **Zero schema changes** introduced by the deploy mechanism.
6. **Production smoke tests unchanged** (same health/routes/BUILD_ID/migrations checks pass).
7. **Observation-window process unchanged** (still compared against the Operations Baseline).
8. **Bounded disk use:** release + rollback retention pruned to a fixed N; disk never grows unbounded
   (also cleans the currently-accumulating `.next.rollback-*` snapshots).
9. Deploys are **serialized** (a lock prevents concurrent/overlapping deploys).

---

## Phase 3 — Risk Review (each with a mitigation)
| Risk | Mitigation |
|---|---|
| **Orphaned build dirs** (failed/old releases) | delete failed release on abort; retention prune keeps last N; a `deploy gc` step |
| **Symlink failures** (broken/wrong target, perms) | after repoint, **verify the symlink resolves to a dir with a valid BUILD_ID** before restart; fail closed + auto-rollback |
| **Disk-space growth** (173 MB/release; 31 GB free) | fixed retention (e.g. N=5 ≈ <1 GB); pre-deploy disk check aborts if free < threshold |
| **Interrupted swap** | symlink switch is a single atomic `rename(2)` — no partial state; interruption mid-build leaves the old symlink untouched |
| **PM2 restart race** | one-shot restart after swap; wait-for-ready + health before declaring success |
| **Concurrent deployments** | a `flock` deploy lock; a second deploy waits or aborts |
| **First-time migration risk** (making live `.next` a symlink) | one-time, reversible host setup with its own runbook + operator authorization, ideally in a quiet window; keep the real `.next` as the first release |
| **Ownership/root** (D5/D23 pattern) | engine runs as `deploy`; ownership guard stays; never root |

---

## Phase 4 — Implementation Plan (only after approval)
1. **Isolated worktree**; author `scripts/deploy/` (build→verify→swap→restart→smoke→rollback + retention +
   lock) with unit-testable pure helpers where possible.
2. **One-time, reversible host migration** to the symlink+`releases/` model (separate runbook + operator
   step; the existing real `.next` becomes release #1; fully revertible to a plain dir).
3. Update the deploy runbook + Operations Baseline "deployment artifacts" section (the transient-error
   note goes away).
4. **Verification before any prod use:** dry-run + a test-instance deploy proving atomicity (error log
   clean, restart+1), a forced-failure proving auto-rollback, and a disk-retention test.
5. Ship behind the same gates: predeploy gate → backup → **the new engine** → smoke → observation.

**Non-goals now:** staging, canary, rolling, multi-node — *designed for*, not built. No change to the
512 MB memory policy (that's D24). No automation work (D19).

---

## Phase 4 — Implementation Status (branch `feature/d25-deployment-engine`)

> **IMPLEMENTED IN ISOLATION · PENDING FOUNDER REVIEW. Never executed against the production host.**
> Nothing here touches `/opt/crowdexpanse/commercial` at runtime until the reviewed, reversible host
> migration + first `--dry-run` under review (Phase 4 plan steps 2 & 4).

**What landed (code-only, additive — no schema, no existing module touched):**
| File | Role |
|---|---|
| `scripts/deploy/deploy-engine.mjs` | The deployment **state machine** (pure orchestration; all side effects injected via `ops`). States `PRECHECK → BUILD → VERIFY_BUILD → SWAP → RESTART → VERIFY_RUNTIME → SMOKE → COMPLETE`, each with entry/exit criteria + **scope-aware rollback** (skipped before SWAP; symlink-repoint + restart after). **Idempotency:** PRECHECK resolves requested vs active release identity; an identical, already-active release short-circuits to `ALREADY_ACTIVE` (no build/swap/restart, success), `--force` bypasses. **Single-active invariant:** SWAP's entry-criterion asserts exactly one valid release is active (proper symlink, not a real dir) before repointing — a violation fails pre-swap, live untouched. **History:** every run persists one record via `persistTrace`. `--dry-run` runs only non-mutating states + swap/rollback-target + single-active + disk/retention validation, **stops before SWAP**, and is safe to re-run. |
| `scripts/deploy/ops-real.mjs` | The **real host operations** injected into the engine: atomic `rename(2)` symlink swap, build into `releases/<stamp>` via `NEXT_DIST_DIR` (stamps a `.release-id` marker **and a rich `release.json`** — releaseId/buildId/commit/builtAt/nodeVersion/schemaVersion/artifacts), BUILD_ID/manifest verify, disk-headroom + lock + **release-identity (git HEAD)** precheck, `assertSingleActive` invariant, pm2 restart + wait-for-online, health/BUILD_ID runtime verify, smoke, retention prune, auto-rollback, and `persistTrace` → `deploy-history/<stamp>.json` (retained to last N). |
| `scripts/deploy/deploy.mjs` | CLI wiring config + real ops into the engine; `--dry-run`, `--force`, `--json`, `--app-dir/--pm2-app/--port/--keep/--release-id/--stamp` overrides. Exit `0` ok/no-op / `1` failed+rolled-back / `2` rollback-itself-failed. |
| `tests/unit/deploy/deploy-engine.test.mjs` | Sandbox test over **real symlinks** in a temp dir (no host). **11/11 pass**, part of the standing unit gate (`run-unit-tests.mjs` extended to discover `*.test.mjs`). |

**Acceptance evidence:**
- **MANDATORY forced-failure rollback (auto-rollback, no manual intervention) — PROVEN:** a restart
  failure *after* SWAP auto-rolls-back — `.next` restored to the previous release, previous **BUILD_ID
  restored**, process restarted, trace `SWAP:ok → RESTART:error → ROLLBACK:done`. SMOKE failure identical.
- **Live-untouched-before-swap:** a `VERIFY_BUILD` failure leaves the live symlink + BUILD_ID unchanged.
- **Idempotency — PROVEN:** re-running `deploy` at the same release id is a **no-op** (no rebuild, no
  swap, no restart, success, `ALREADY_ACTIVE` in the trace); `--force` redeploys; repeated `--dry-run`
  never swaps and never short-circuits.
- **History — PROVEN:** every run (success, failure, no-op, dry-run) persists one record with per-state
  timestamps, timings, BUILD_ID, release id, and smoke/rollback status; written on failure paths too.
- **Release manifest — PROVEN:** each build writes `release.json`
  (releaseId/buildId/commit/builtAt/nodeVersion/schemaVersion/artifacts) alongside the minimal
  `.release-id` idempotency marker — the richer record for diagnostics, rollbacks, history, artifact
  verification, and future canary.
- **Single-active invariant — PROVEN:** a swap is refused **pre-swap** when `.next` is a real directory
  (two competing "current" releases) — the live release is left untouched and the violation is reported.
- **Gate green:** `tsc --noEmit` 0 errors; unit suite passes incl. the engine test (**11 cases**); all
  critical branch ≥ 90%, overall branch ≥ 93%. No existing module or schema changed.

**Deliberately NOT done in this phase (each its own authorized step — see D25b below):** the one-time
reversible host migration to the symlink+`releases/` model; any `--dry-run` or deploy on the production
host; runbook / Operations-Baseline updates. `ops-real.mjs` is syntax-checked but, by design, **first
exercised on the host only via `--dry-run` under review**.

---

## D25a / D25b — split (engine vs cutover)

Implementation and operational cutover are different risk profiles and deserve separate reviews:

| Item | Scope | Status |
|---|---|---|
| **D25a — Deployment Engine** | The state machine + real ops + CLI + tests (this branch). Pure code, isolated, never touches the host. | **Implemented · self-tested · PENDING FOUNDER REVIEW** |
| **D25b — Production Host Migration** | The one-time, reversible cutover of the live `.next` (currently a 173 MB real dir) to the symlink+`releases/` model; its own runbook, operator authorization, and staging rehearsal. **→ [D25B_HOST_MIGRATION_INITIATIVE.md](./D25B_HOST_MIGRATION_INITIATIVE.md)** | **NOT started — separate approval required** |

**D25b acceptance criterion — one live rehearsal on a staging-like environment before any production
migration:**
```
Dry Run → Forced Failure → Rollback → Recovery → Second Dry Run → Normal Deployment → Smoke
```
Only after that rehearsal passes end-to-end is the first **production** migration authorized. D25a is
considered complete once reviewed; D25b then proceeds as its own initiative.

---
*Stop point: Phases 1–3 approved. D25a implemented in isolation + self-tested (forced-failure rollback,
idempotency, and history persistence all proven in sandbox). Awaiting Founder review of D25a before D25b
(host migration) is opened — no host execution until the D25b staging rehearsal passes.*
