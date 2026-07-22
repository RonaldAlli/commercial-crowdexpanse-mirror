# D27 — Automation runtime: unexpected SIGINT under pm2 (investigation charter)

> **Opened 2026-07-22** out of the [D19 production verification](../releases/D19_PRODUCTION_VERIFICATION.md).
> **Acceptance-first, identification-first.** D19's startup contract is fixed + deployed; this initiative is the
> *separate* production-only problem: under pm2 supervision the automation runtime receives **unexpected
> `SIGINT`** signals and exits cleanly, causing a restart loop. **The signal source is not yet identified.**
> Scope is deliberately narrow: **find out who sends the signal and why — before evaluating any fix.**

## Problem statement (observed, established)
- `pm2 start ecosystem.config.js --only crowdexpanse-automation` → the process is sent **`SIGINT` ~3–4 s after
  start**, exits **code 0** (its graceful handler runs), and pm2 autorestarts it — a loop.
- pm2 did **not** initiate the stop (no `Stopping app` in the daemon log). The daemon-forked child is its **own
  session leader** (not the login shell's job-control signal).
- **Discriminator:** trivial `.mjs` and `--import tsx`+`.ts` pm2 probes are **stable**; a minimal
  `new PrismaClient(); await $connect()` pm2 probe **reproduces** the SIGINT. Prisma is on the **library
  engine** (`libquery_engine-…so.node`, no binary child process).
- The runtime is **correct**: run **directly** (`node --env-file-if-exists=.env --import tsx
  scripts/automation-runtime.mjs`) it boots (`scheduler=off · handlers=1`) and shuts down gracefully; staging
  acceptance is 31/31.
- **Lead (not proof):** the daemon log shows `crowdexpanse-commercial` (also Prisma + pm2 fork) in a similar
  SIGINT loop on **2026-07-10**, which then recovered and has run stably since.

## Objective
**Identify the source of the unexpected SIGINT and determine why it affects the automation runtime under pm2.**
Root cause **before** remedies.

## Questions D27 must answer (in order) — gate before any implementation
1. **Which process sends the SIGINT?** — capture the sender PID/UID/comm at delivery time.
2. **Under what conditions?** — constant, or tied to an active operational session / a periodic trigger / a
   specific startup phase?
3. **Why the automation runtime but not ordinary pm2 processes?** — Prisma, the runtime logic, the entrypoint,
   or another component?
4. **Is it reproducible outside the current operational session?** — detached / no interactive shell / a fresh
   login; does it persist if the process is started and left completely idle?
5. **Is it specific to pm2, Prisma, the runtime, or another supervisory component?** — e.g. reproduce a minimal
   Prisma app under pm2 vs. under systemd vs. bare `setsid`.

## Method (candidate — identification only)
- **Signal-sender attribution:** an `auditd` rule on signal delivery to the child PID, and/or an eBPF
  `signal:signal_generate` tracepoint (`bpftrace`), and/or `strace -f -e trace=signal` on the daemon-forked
  child. Goal: the **sender's** PID/UID/comm and the exact timing.
- **Controlled matrix:** minimal Prisma-`$connect` process under {pm2 fork, systemd unit, bare `setsid`
  detached} × {interactive session present, fully detached} — hold everything else constant.
- **Comparison:** diff the automation pm2 app definition + runtime env against the **stable** web app (both
  Prisma + pm2 fork) to find the differentiating factor.

## Explicitly OUT of scope (until the sender is identified)
- Any remedy — pm2 config change, a launcher/wrapper, a **systemd** unit, Prisma engine changes, or runtime
  code changes. These are evaluated **only after** Q1–Q5 are answered.
- Enabling automation or the scheduler. `AUTOMATION_SCHEDULER_ENABLED` stays **0** regardless of D27.

## Safety boundaries
Diagnostics are **read-only / observational** (signal tracing, controlled minimal probes). No prod queue
mutation (`automation_jobs`/`automation_executions` stay 0). Prefer staging / throwaway probes; if a prod probe
is needed, it is short, tagged, autorestart:false, and removed. The prod automation app stays **not running**
and **not in the pm2 boot dump**.

## Definition of done (identification phase)
A written root-cause: the **signal sender**, the **conditions**, and **why the automation runtime specifically**
— reproducible and evidenced. Only then does D27 propose (separately) a remedy for review.
