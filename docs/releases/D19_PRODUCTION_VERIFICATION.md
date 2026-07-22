# D19 — Production Verification report

> **2026-07-22.** D19's startup-contract fix is **merged, deployed, and web-verified in production**. The
> subsequent *automation start-verification* uncovered a **separate, pre-existing production pm2-supervision
> anomaly** (a transient SIGINT restart-loop) that blocks a stable pm2 start of `crowdexpanse-automation`. This
> is NOT a D19 code defect. Automation was NOT enabled; the scheduler kill-switch stays OFF; prod left pristine.

## What shipped + verified ✅
- **Merge:** `fix/d19-automation-runtime-tsx-dep` fast-forwarded into `main` → **`61d130f`**; pushed to gitea
  `origin` + `github` mirror.
- **Backup:** restore-verified adhoc backup **`20260722-023815Z`** (Backup→Verify→Restore-Test PASS: 13 tables,
  counts MATCH).
- **Deploy (D25 engine):** `deploy.mjs --production --yes` ran the full lifecycle `PRECHECK → BUILD →
  VERIFY_BUILD → SWAP → RESTART → VERIFY_RUNTIME → SMOKE → COMPLETE`, no rollback. Prod now serves build
  **`1sRdEL_negGhyV9wcq89z`** (release `r606690952643383-1846283`; prev `r600449282025122-1766508` retained).
- **Web app:** health **200** (5/5 probes), `unstable_restarts=0`, **no new errors** (error log's last write
  predates the deploy by two days). The web app is unaffected.
- **The D19 fix itself is correct** and confirmed under the real pm2 path:
  - pm2 **does** apply the committed `node_args` — `process.execArgv = ["--env-file-if-exists=.env",
    "--import","tsx"]` (verified via a probe; `/proc/cmdline` is misleading for pm2's wrapper).
  - `.env` **is** loaded by pm2's launch (`DATABASE_URL` present from `.env`, not injected).
  - Run **directly** (`node --env-file-if-exists=.env --import tsx scripts/automation-runtime.mjs`) the runtime
    boots (`runtime starting · scheduler=off · handlers=1`) and shuts down gracefully — matching staging 31/31.

## The blocker — a transient pm2 SIGINT restart-loop (NOT a D19 defect) ⛔
Started via the runbook command `pm2 start ecosystem.config.js --only crowdexpanse-automation`, the process is
sent an **external `SIGINT` ~3–4 s after start**, exits (graceful, code 0), and pm2 autorestarts it — a loop.
Daemon log (no `Stopping app` line ⇒ pm2 did **not** initiate it):
```
App [crowdexpanse-automation:11] online
App [crowdexpanse-automation:11] exited with code [0] via signal [SIGINT]   (repeats every ~4s)
```

### Isolation (minimal probes under pm2 fork, autorestart:false)
| Probe | Touches Prisma? | Result |
|---|---|---|
| trivial `.mjs` (`setInterval`) | no | **stable** (online 12s) |
| `--import tsx` importing a trivial `.ts` | no | **stable** (online 12s, banner printed) |
| `new PrismaClient(); await $connect()` | **yes** | **SIGINT'd ~3s** (reproduces the loop) |

⇒ Correlates with **Prisma**. But Prisma is on the **library engine** (`libquery_engine-…so.node`, no binary
child process), so it is *not* a query-engine-child signal issue.

### Decisive context — this has hit the WEB app too, and it's stable long-term
The same daemon log shows `crowdexpanse-commercial` (also a Prisma app under pm2 fork) in the **identical
SIGINT loop on 2026-07-10** (`exited … via signal [SIGINT]`, repeating) during an active pm2-operation window —
after which it **recovered and has run stably for days**. So **Prisma × pm2-fork is not inherently broken**
(the web app is the proof). The SIGINT loop is a **transient, conditional supervision anomaly** correlated with
active pm2-operation sessions + Prisma startup — its *sender* is still unidentified (pm2 did not initiate it,
and the daemon-forked child is its own session leader, so it isn't the login shell's job-control signal).

## Assessment
- **D19's startup contract is complete and deployed.** The tsx-loader + `.env`-loading fixes are correct and
  proven under the real pm2 launch (node_args applied, `.env` loaded) and by a stable direct run.
- **A stable pm2 *run* of the automation process is blocked** by the SIGINT-loop anomaly, which is a
  production/host pm2-supervision issue — pre-existing (predates D19; hit the web app on 07-10), not caused by
  D19, and not reproducible by running the runtime directly or in staging (which don't use pm2 fork supervision
  in an active-ops session).

## Prod state (pristine)
`crowdexpanse-automation` **not running**, **not in the pm2 boot dump** (won't auto-start on reboot),
`AUTOMATION_SCHEDULER_ENABLED=0`. Web app healthy on `1sRdEL_negGhyV9wcq89z`. All diagnostic probes removed; no
orphan processes. No queue state touched (`automation_jobs=0`, `automation_executions=0` throughout).

## Recommendation (for founder decision)
1. **Accept D19's startup-contract fix** as deployed + web-verified (it did its job).
2. **Open a focused, acceptance-first follow-up** (e.g. **D27 — "automation runtime pm2 supervision / SIGINT
   restart-loop"**) to root-cause the SIGINT *sender* and prove a stable start. Candidate angles: trace the
   signal sender (auditd/eBPF/`strace -p` on the daemon-forked child); test start-then-leave-idle vs
   active-session; diff against the web app's stable pm2 config; the 2026-07-10 web precedent; and, if pm2 fork
   supervision proves unreliable for this workload, a **systemd unit** as an alternative supervisor.
3. **Do NOT enable the scheduler** — unchanged; a separate authorization regardless.
