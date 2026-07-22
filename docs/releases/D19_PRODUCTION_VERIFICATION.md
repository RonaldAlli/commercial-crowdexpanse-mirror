# D19 — Production Verification report

> **2026-07-22.** D19's startup-contract fix is **merged, deployed, and web-verified in production**. The
> subsequent *automation start-verification* uncovered a **separate, production-only operational issue**: under
> pm2 supervision the automation runtime **receives unexpected `SIGINT` signals** and exits cleanly, causing a
> restart loop. **The source of those signals has not yet been identified** — characterizing it as a
> "pm2-supervision anomaly" is a hypothesis, not an established root cause. It is NOT a D19 code defect (the
> runtime starts correctly when invoked directly with the intended flags + env). Automation was NOT enabled;
> the scheduler kill-switch stays OFF; prod left pristine. **Root-causing this is deferred to D27.**

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

## The blocker — the runtime receives unexpected SIGINT under pm2 (source UNIDENTIFIED; NOT a D19 defect) ⛔
Started via the runbook command `pm2 start ecosystem.config.js --only crowdexpanse-automation`, the process
receives an **unexpected `SIGINT` ~3–4 s after start**, exits (graceful, code 0), and pm2 autorestarts it — a
loop. **Who sends the SIGINT is not yet known.** Daemon log (no `Stopping app` line ⇒ pm2 did **not** initiate
the stop itself):
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

### Suggestive context (observation, not proof) — the WEB app showed the same pattern once
The same daemon log shows `crowdexpanse-commercial` (also a Prisma app under pm2 fork) in a **similar SIGINT
loop on 2026-07-10** (`exited … via signal [SIGINT]`, repeating) during an active pm2-operation window, after
which it **recovered and has run stably for days**. This *suggests* Prisma × pm2-fork is not a permanent
incompatibility (the web app runs it 24/7) and that the behavior is conditional rather than constant — but it
does **not** identify the signal source, and should be read as a lead for D27, not a conclusion.

## Assessment (observed vs. hypothesis)
**Observed (established):**
- **D19's startup contract is fixed and deployed.** tsx-loader + `.env`-loading are correct and proven under
  the real pm2 launch (node_args applied, `.env` loaded) and by a stable direct run.
- Under pm2, the automation process **receives `SIGINT` ~3–4 s after start and exits code 0**; pm2 restarts it.
- pm2 did **not** initiate the stop (no `Stopping app`). The daemon-forked child is its **own session leader**
  (so it is not the login shell's job-control signal). Trivial + tsx/`.ts` pm2 probes are stable; a minimal
  Prisma-`$connect` pm2 probe reproduces the SIGINT.

**Not yet established (open questions for D27):**
- **Who sends the SIGINT, and why.** "pm2/host supervision anomaly" and "Prisma-correlated" are *hypotheses*
  consistent with the evidence, not proven root causes.
- Whether the behavior persists outside the current active operational session.
- Whether it is specific to pm2, Prisma, the runtime logic, or another supervisory component.

## Prod state (pristine)
`crowdexpanse-automation` **not running**, **not in the pm2 boot dump** (won't auto-start on reboot),
`AUTOMATION_SCHEDULER_ENABLED=0`. Web app healthy on `1sRdEL_negGhyV9wcq89z`. All diagnostic probes removed; no
orphan processes. No queue state touched (`automation_jobs=0`, `automation_executions=0` throughout).

## Status + recommendation (per founder)
**D19 is functionally complete, with one caveat:**
- The runtime **startup contract is fixed and deployed**; the scheduler remains intentionally **disabled**.
- The runtime **should NOT be considered production-operational** until **D27** resolves the unexpected
  pm2/SIGINT behavior.

**D27 — "Automation runtime: unexpected SIGINT under pm2" (to be opened, acceptance-first).** Objective:
**identify the source of the unexpected SIGINT and why it affects the automation runtime under pm2.** D27 must
answer these BEFORE any implementation option is evaluated:
1. **Which process sends the SIGINT?** (`auditd` rule on signal delivery, eBPF `signal:signal_generate` trace,
   or `strace -f -e trace=signal` on the daemon-forked child.)
2. **Under what conditions?** (constant, or tied to an active operational session / a periodic trigger?)
3. **Why the automation runtime but not ordinary pm2 processes?** (Prisma? runtime logic? the entrypoint?)
4. **Is it reproducible outside the current operational session** (detached, no interactive shell)?
5. **Is it specific to pm2, Prisma, the runtime, or another supervisory component?**

Only **after** those are answered should remedies (pm2 config, a launcher, or a **systemd** unit, etc.) be
evaluated — do **not** jump to a supervisor change before the sender is known. The 2026-07-10 web-app
occurrence is a **lead**, not a conclusion.

**Throughout: the scheduler stays OFF** — a separate authorization regardless of D27.
