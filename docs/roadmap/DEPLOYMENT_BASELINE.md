# CrowdExpanse Commercial — Deployment Baseline

> **The operational handbook for deployments via the D25 Deployment Engine** (atomic symlink + `releases/`
> model). Figures are **measured** from the D25b staging rehearsal (2026-07-21) on the isolated staging
> instance. Distinct from the [Operations Baseline](./OPERATIONS_BASELINE.md) (how prod behaves) — this is
> how a *deployment* behaves. Linked from Architecture Index §0b.

---

## Normal deployment (success path)
State sequence (each a gate; failure ⇒ auto-rollback):
```
PRECHECK → BUILD → VERIFY_BUILD → SWAP → RESTART → VERIFY_RUNTIME → SMOKE → COMPLETE
```
| Phase | Measured (staging) |
|---|---|
| Full deploy duration | **~106 s** (build-dominated; the build is ~100 s) |
| Atomic change window (SWAP start → serving/verified) | **~1.7 s** |
| PM2 restart (RESTART start → online) | **~0.8 s** |
| Runtime verify (health + BUILD_ID) | **~0.9 s** |
| Smoke (routes) | **~0.3 s** |
| **Application-unavailable (health≠ok)** | **~1.3 s** (the PM2 restart only) |

The build happens **off to the side** in `releases/<stamp>`; the live `.next` symlink is untouched until
the atomic swap. User-visible impact is bounded by the restart (~1–2 s), not the build.

## Rollback (automatic, on any post-swap failure)
Proven in the rehearsal by a forced failure (release whose health returns non-`ok`):
| Metric | Measured (staging) |
|---|---|
| Time to **detect** | **~10.7 s** for a health-verify failure (bounded by the runtime-verify timeout ~20×500 ms); other failures (restart/smoke) detect faster |
| Time to **roll back** (symlink repoint + restart + health) | **~1.8 s** |
| Total **recovery** (detected → previous release healthy) | **~1.8 s** |
| Application-unavailable during a **failed** deploy | **~12.8 s** (≈ detect + rollback) — the worst case |
| Manual intervention | **none** — the engine repoints `.next` to the previous release and restarts automatically |

## Expected artifacts (per deploy)
- `releases/<stamp>/` — the built release: `BUILD_ID`, `release.json` (releaseId/buildId/commit/builtAt/
  nodeVersion/schemaVersion/artifacts), `.release-id`, and `types/`.
- `.next` → **symlink** to the active release (the only "current" pointer; single-active invariant).
- `deploy-history/<stamp>.json` — one record **per run** (success, failure, no-op, dry-run): per-state
  transitions + timestamps + durationMs + smoke/rollback status. Written only if PRECHECK passed.
- `tsconfig.deploy.json` — generated for the build, **removed in a `finally`** (never persists).

## Retention
- Releases: **last 5** (`keepReleases`), older pruned at COMPLETE.
- Deploy history: **last 200** records (`keepHistory`).

## Operational checklist (per deploy)
1. Target is **explicit + fail-closed**: `--app-dir <path>` (no default); production requires `--production`
   **and** a `.production-instance` sentinel; mutating deploys require `--yes`.
2. Read the **resolved-context banner** (Application / Mode / Release / Database / PM2 / Port) before it runs.
3. Watch the trace to `COMPLETE`; confirm `DEPLOYED — serving <BUILD_ID>` and `SMOKE ok`.
4. On failure: confirm `ROLLBACK done` + the previous release is serving + health ok (auto).
5. Fresh build only — **never migrate build artifacts** between releases (Engineering Baseline #10).

## Anomaly guide
- **A killed deploy (SIGTERM/SIGKILL/OOM) can leave a stale `.deploy.lock`** — the lock is released in a
  `finally` that a hard kill bypasses. Symptom: the next deploy reports "another deploy holds the lock."
  Remedy: confirm no deploy is running, then remove `.deploy.lock`. *(Observed in the rehearsal; a
  staleness/PID-guard on the lock is a candidate follow-up — see D25b results.)*
- **PM2 `restart_time` increasing is NOT a deployment signal** — it's the pre-existing graceful
  memory-recycle (D24). Judge deployments by the trace + smoke, not the restart counter.

## Production history — first real deployment through the engine
- **2026-07-22 — FIRST successful production deployment via the D25 Deployment Engine.** Shipped the Deal
  Analyzer bounded-list fix (`deploy.mjs --app-dir /opt/crowdexpanse/commercial --production --yes`). Full
  lifecycle `PRECHECK → BUILD → VERIFY_BUILD → SWAP → RESTART → VERIFY_RUNTIME → SMOKE → COMPLETE`; build
  `AKUhg2gFVCyjthMDVFvL3` → `iV84TbmJSWasU9XBvMmdQ`; no rollback; `unstable_restarts=0`; no new app errors;
  clean observation.
- **The very first attempt exposed [DE-5](../releases/DE5_DEPLOY_TSCONFIG_RELEASES.md)** (deploy tsconfig
  type-checked sibling release #1's depth-mismatched types) and **failed at BUILD, before SWAP — production
  was left untouched.** That is the engine's fail-before-swap safety working as designed. DE-5 was fixed
  (deploy tsconfig excludes build-output/release dirs) + regression-tested, and the redeploy succeeded — the
  first real end-to-end validation of the engine in production.

---
*Baseline measured on staging during the D25b rehearsal; first production deployment 2026-07-22 confirmed the
same lifecycle live (see Production history above).*
