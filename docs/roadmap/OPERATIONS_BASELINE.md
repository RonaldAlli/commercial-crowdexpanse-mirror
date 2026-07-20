# CrowdExpanse Commercial — Operations Baseline

> **Purpose:** the known, expected operational behaviors of production, so release observation windows
> compare against this baseline instead of rediscovering the same characteristics each time. Update
> when a behavior genuinely changes. Volatile per-release values (current build/commit) live in
> [Current Platform Status](../CURRENT_PLATFORM_STATUS.md), not here. **As of 2026-07-20.**

## Processes (PM2)
| Process | Expected state |
|---|---|
| `crowdexpanse-commercial` | **online**, fork mode, `next start -p 3030` → nginx → :3030 |
| `crowdexpanse-automation` | **absent / stopped** — paused pending D19; presence is an anomaly |

## Known behavior — graceful PM2 memory recycle (D24, pre-existing)
- **`max_memory_restart = 512 MB`** for `crowdexpanse-commercial`. When RSS exceeds it, pm2 **gracefully
  recycles** the process: exit code `0` via `SIGINT`, `unstable_restarts = 0`, back up with
  `✓ Ready in <1s`. **No crash, no downtime spike, no error-log growth.**
- **Cadence:** observed **multiple times per day, sometimes clustered** (a run of recycles within a few
  minutes when RSS spikes, then quiet for hours). Long-standing since **2026-06-22**. An *acceptable*
  cadence has not yet been formally defined — that is part of **D24 (memory investigation)**.
- **RSS range:** steady-state ~**380–410 MB**; recycles trigger between ~**512 MB and ~870 MB**.
- **Release implication:** **restart count is NOT a stable release metric.** Any observation window of
  meaningful length will see ≥1 graceful memory recycle. Judge restarts by *character*, not *count*.

## Health / DB
- `GET /api/health` → `{"status":"ok", dbMs:<single-digit..~120>, uptime, commit:null}`. `commit` is
  currently null (not wired) — not an error.
- **Applied migrations: 30.** A change here outside a reviewed migration is an anomaly.
- `scripts/audit/crm-integrity.mjs` → clean (0 cross-org / 0 orphan / 0 duplicate).

## Deployment artifacts (current process — until D25)
- Deploy = in-place `npm run build` over live `.next` + `pm2 restart crowdexpanse-commercial`.
- **Expected transient artifact:** during the build window the serving process briefly logs
  `Error: Could not find a production build in the '.next' directory` (+ pm2 crash-retries, so
  `restart_time` climbs a few counts), **self-resolving at restart**. This is a *deploy-mechanics*
  artifact, **not** an application defect. **D25** (build-elsewhere + atomic swap) will eliminate it.
- Every deploy retains: a `.next.rollback-<stamp>` snapshot (prior build) + a restore-verified DB
  backup under `/opt/crowdexpanse/backups/commercial/adhoc/`.

## Frozen references (immutable)
`v1.3.0` → `d341c0a` · `v1.4.0` → `ece38aa` · `opportunity-pipeline-slice1` → `a2f9fd4`.

## Release observation — what to compare against this baseline
At close-out, treat as **expected** (not failures): a graceful memory recycle (exit 0, `unstable=0`,
no error growth); transient deploy-window build errors that stop at restart. Treat as **anomalies**
(investigate, do not accept): `unstable_restarts > 0` / crash loop; a *new* post-startup error burst;
build ID or commit drift; migration-count change; Automation appearing; DB integrity violations; RSS
climbing without recycling or a rising recycle cadence (→ D24).
