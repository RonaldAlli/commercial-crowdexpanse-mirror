# D27 — Process-Supervision Investigation: unexpected SIGINT to the automation runtime under pm2

> **Investigation report (read-only phase). Identification-first — the next gate is ratification of this report and
> the attribution method, NOT code.** Extends the [D27 charter](./D27_AUTOMATION_PM2_SIGINT_INVESTIGATION.md) with a
> completed read-only phase. **No supervision change, no pm2 start/stop, no scheduler enablement, no prod config
> change was made.** Prod is pristine: `crowdexpanse-automation` is **not running** and **not in the pm2 boot dump**;
> `AUTOMATION_SCHEDULER_ENABLED=0`. 2026-07-23.

---

## 1. Current-state process lifecycle

```
systemd ─▶ pm2 "God" daemon (fork supervisor)
   ├─fork▶ crowdexpanse-commercial   node next start -p 3030      STABLE. Restarts are pm2-initiated
   │                                                              (each preceded by "Stopping app").
   ├─fork▶ crowdexpanse-deals / dealflow / breadbasketfarms-web   STABLE (other apps, same host).
   └─fork▶ crowdexpanse-automation   node --env-file-if-exists=.env --import tsx scripts/automation-runtime.mjs
                                     DECLARED inert (autorestart:true, not started on deploy, scheduler OFF).
                                     main(): startExecutorLoop + reaper intervalLoop (+ scheduler if enabled=OFF);
                                     SIGINT/SIGTERM → shutdown() → drain → process.exit(0).

Observed loop when started (2026-07-22, from the pm2 daemon log):
   pm2 start ──▶ online ──(~3–4 s)──▶ [EXTERNAL SIGINT] ──▶ handler shutdown() ──▶ exit code 0
             ──▶ pm2 autorestart ──▶ online ──▶ … repeat every ~3–4 s … ──▶ operator `pm2 stop`.
```

The runtime holds **live timers** (executor + reaper), so it **cannot exit naturally**; a clean `exit(0)` can occur
**only** through the SIGINT/SIGTERM handler. Therefore an actual signal is delivered — this is not a self-exit.

## 2. Evidence gathered (all read-only)

**E1 — the loop, from `~/.pm2/pm2.log` (2026-07-22 10:22:55–10:23:11):** `crowdexpanse-automation:11` cycles
`online → exited with code [0] via signal [SIGINT]` at 10:22:59, :23:02, :23:06, :23:09 — **~3–4 s apart, with NO
"Stopping app" line before each exit** (the final 10:23:11 exit *is* preceded by "Stopping app" — the operator's
`pm2 stop`). ⇒ pm2 did **not** initiate the mid-loop SIGINTs.

**E2 — discriminator (D19 probe matrix, pm2 fork, autorestart:false):** trivial `.mjs` (`setInterval`) → **stable**;
`--import tsx` + trivial `.ts` → **stable**; `new PrismaClient(); await $connect()` → **SIGINT'd ~3 s (reproduces)**.
The pm2 log confirms `d19prismaprobe:15` exited via SIGINT with no preceding "Stopping app". ⇒ **Prisma-correlated**;
and it is the **library engine** (`libquery_engine-*.so.node`, no child process) — not a query-engine-child signal.

**E3 — application code is NOT the sender (new, decisive — full-repo read-only scan):**
- `lib/automation/{executor,scheduler,reaper,registry}.ts` — **no** `process.on(SIG*)`, `process.exit`,
  `process.kill`, `child_process`/`spawn`, or `PR_SET_PDEATHSIG`; only cooperative `setTimeout` backoff loops.
- **D25 deploy engine** restarts **only** the explicitly-named web app: `deploy.mjs:41` `pm2App = "crowdexpanse-commercial"`;
  `ops-real.mjs:181/207/253` `execFile("pm2",["restart",pm2App,...])` — no `all`/wildcard, no shell expansion, **no**
  `pm2 stop/delete/kill`, no `pkill`/`killall`/`kill -INT`. It cannot touch `crowdexpanse-automation`.
- Whole-repo grep for `SIGINT|SIGTERM|process.kill|pkill|killall|kill -|pm2 (restart|reload|stop|delete|kill)`: every
  hit is either the runtime's **handlers** (receivers) or a test-harness `child.kill` against a `_test`-DB child.
- **No** cron/systemd/timer/monitor anywhere in the repo. Host: the only user cron jobs belong to a **different app**
  (`/opt/crowdexpanse/deals/`), 15-min cadence — which cannot explain a **3–4 s-after-each-restart** reaction.

**E4 — session-leader / conditional:** the daemon-forked child is its **own session leader** (not shell job-control).
The 2026-07-10 lead is **weaker than it looks**: that `crowdexpanse-commercial` loop exited **code [1]** (a crash —
consistent with the known stale-`.next` "no production build" incident), and pm2 labels *every* restart
"via signal [SIGINT]" in its log. So the 07-10 web event is most likely a **crash-loop mislabeled**, not the same
*clean-exit-0 external SIGINT* seen on automation. It remains a lead for "conditional / recovered," not a match.

**E5 — pm2 default:** `ecosystem.config.js` sets **no** `kill_signal`/`kill_timeout`, so pm2 uses its defaults —
and **pm2's default stop signal IS SIGINT** (then SIGKILL after ~1.6 s). This is why "Stopping app" ⇒ SIGINT; it is
also why a SIGINT *without* "Stopping app" is the precise fingerprint of a **non-pm2-stop** sender.

## 3. Root-cause findings

**Established:** a real SIGINT is delivered to the automation runtime ~3–4 s after each start; the process exits 0 via
its graceful handler; pm2 autorestarts → loop. It is **Prisma-`$connect`-correlated**, **not pm2-stop-initiated** (no
"Stopping app"), **not application code** (E3, ruled out), **not cron/deploy/monitor** (E3), **not the query-engine
child** (library engine), **not the tsx loader per se** (tsx probes stable). The child is its own session leader.

**The one missing fact:** the **sender's identity** — `(pid, uid, comm)` at signal-delivery time. It cannot be
obtained read-only: it requires observing a **live reproduction** (which needs the process started under pm2 — out of
scope until ratified). **Root cause is therefore NOT yet identified; the suspect layer is pm2-supervision /
node-tsx-runtime / OS-or-environment.**

### Ranked hypotheses + the single discriminating test each
| # | Hypothesis | Supported by | Discriminating test |
|---|---|---|---|
| **H1** | An **external, session-bound agent/monitor** signals Prisma/DB-connecting processes it doesn't recognize | Prisma-correlated · conditional · "recovered when the operational session ended" (07-10) | Reproduce the Prisma probe **fully detached** (`setsid`, no interactive session, no operator/agent active). SIGINT vanishes ⇒ session-bound external sender. |
| **H2** | **pm2 supervision internal path** sends SIGINT outside the `pm2 stop` code path | pm2's default kill-signal is SIGINT; only reproduces under pm2 | Reproduce the same probe under **systemd unit** and **bare `setsid`** (no pm2). SIGINT vanishes ⇒ pm2-specific. |
| **H3** | The **node/`--import tsx`/Prisma startup** self-signals or a helper signals ~3 s in | 3 s ≈ a startup-phase timing; only with Prisma | Reproduce Prisma **without tsx** (plain `.mjs` + `@prisma/client`) under pm2. SIGINT persists ⇒ not tsx; isolates Prisma×pm2. |
| **H4** | An **environment-level lifecycle manager** outside pm2 supervises/culls the process — a container runtime, service wrapper, login/session manager, or infrastructure watchdog | supervision investigations must rule this out; cheap to eliminate | The `signal_generate` capture names a non-pm2, non-app sender; corroborate via the sender's `comm`/cgroup/parent. Also: does it persist across `{container vs host, login-session vs system-service}`? |

A single `bpftrace signal:signal_generate` capture answers all four at once by **naming the sender** (pid/uid/comm),
which directly exposes an environment-level manager (H4) if one is present.

## 4. Reproduction & attribution procedure (to run ONLY after ratification)

Per the charter's controlled-minimal-probe allowance (short, tagged, `autorestart:false`, removed; real apps
untouched). **Not executed in this read-only phase.**

1. **Attribution trace** (root): capture the sender while the probe loops —
   `bpftrace -e 'tracepoint:signal:signal_generate /args->sig==2/ { printf("SIGINT tgt=%d(%s) by=%d(%s) uid=%d\n", args->pid, args->comm, pid, comm, uid); }'`
   (alternatively `auditd` on signal delivery, or `strace -f -e trace=signal` on the forked child).
2. **Minimal Prisma probe** = `new PrismaClient(); await $connect();` + a keep-alive `setInterval`, tagged `d27-*`,
   `autorestart:false`.
3. **Controlled matrix:** the probe under **{pm2 fork · systemd unit · bare `setsid`}** × **{interactive session
   present · fully detached}**, everything else held constant — resolves H1/H2/H3 in one table.
4. **Comparison:** diff the automation app definition + env against the stable web app (both Prisma + pm2 fork).

## 5. Risks

- **Perturbing prod supervision** — mitigated: probes only, `autorestart:false`, tagged, removed; the prod automation
  app stays out of the pm2 list **and** the boot dump; scheduler stays `0`; `automation_jobs`/`automation_executions`
  untouched (0).
- **Observer effect** — `bpftrace` is low-overhead kernel-side; unlikely to change timing.
- **False attribution** — mitigated by the pm2/systemd/setsid matrix (cross-checks the layer).
- **The sender may be environmental** (H1) — the "fix" could be operational (stop/relocate the agent), not a code
  change; the report must not presume a code remedy.

## 6. Proposed invariants (Automation Runtime Supervision contract)

- **ARI-1 · Attribution before remedy.** No supervision/runtime/config change until the sender's `(pid,uid,comm)`
  and the triggering condition are captured and understood.
- **ARI-2 · Supervision integrity during attribution.** Production process supervision is unchanged while
  identifying the sender (founder rule) — probes never alter the supervision of real apps.
- **ARI-3 · Loop-free soak before enablement.** Once remedied, the runtime must run a defined soak (≥ 30 min) under
  **real** supervision with **zero** unsolicited SIGINT and **zero** restarts (`unstable_restarts=0`), scheduler OFF.
- **ARI-4 · Scheduler gate.** `AUTOMATION_SCHEDULER_ENABLED` stays `0` through all of D27; enabling automation is a
  separate, founder-gated step **after** ARI-3.
- **ARI-5 · Shutdown budget (separate hardening).** The drain must complete within the supervisor's kill_timeout —
  the known out-of-scope mismatch (reaper's 30 s non-interruptible sleep vs pm2's ~1.6 s default) is fixed only
  after the loop is solved.

## 7. Correction options (contingent on attribution — NOT chosen)

A decision tree, gated on §3's outcome; each paired with the ARI-3 soak as its acceptance:
- **If H1 (session-bound agent):** identify and stop/relocate the sender, or run automation where it isn't reached
  (e.g., a detached systemd unit). *Tradeoff:* may be operational/environmental, possibly outside the repo.
- **If H2 (pm2-specific):** (a) move automation to a **systemd unit** — robust supervision, own cgroup, no pm2 quirk
  [*tradeoff:* diverges from the pm2 fleet, new ops surface]; (b) a supervised wrapper (`setsid`/`dumb-init`)
  [*tradeoff:* added layer]; (c) a pm2 config change [*tradeoff:* masks rather than fixes — the charter cautions
  against a supervisor change before the sender is known].
- **If H3 (node/tsx/Prisma startup):** precompile the runtime to `.js` (drop `--import tsx`) or adjust the Prisma
  startup/engine [*tradeoff:* a build step]. Only if the trace implicates the runtime itself.

## 8. Acceptance scenarios

- **AC-D27-1 (identification):** the trace names the SIGINT sender `(pid,uid,comm)` for ≥ 3 loop iterations.
- **AC-D27-2 (isolation):** the §4 matrix produces a result table isolating the responsible layer (pm2 vs systemd vs
  setsid; session vs detached).
- **AC-D27-3 (post-remedy soak):** automation runs ≥ 30 min under real supervision, scheduler OFF, 0 unsolicited
  SIGINT, `unstable_restarts=0`.
- **AC-D27-4 (prod safety, throughout):** the prod automation app stays out of the pm2 list + boot dump; queue tables
  remain 0; supervision of real apps unchanged.
- **AC-D27-5 (attribution gate):** a proposed fix may be implemented **only after the sender is positively identified
  by evidence.** `Unknown sender → no runtime change`; `Attributed sender → candidate remediation`. This forbids
  fixing a symptom without the mechanism.

## 9. Rollback strategy

The investigation **makes no changes → nothing to roll back.** For each future probe: it is `autorestart:false`,
tagged `d27-*`, and removed (`pm2 delete d27-*`) — which never touches the real apps; the prod automation app stays
absent from the pm2 list and `dump.pm2`. No prod config/supervision change is proposed in this phase.

## 10. Definition of done (this phase)

This report + a ratified **attribution method** (§4) is the gate. Only after §3's sender is identified and §8's
AC-D27-1/2 are met does D27 propose a specific remedy (§7) for separate review — then implement + soak (ARI-3) before
any scheduler enablement (ARI-4).

## 11. Controlled attribution experiment — results (2026-07-23)

Ran the authorized controlled experiment (tagged `d27-*`, `autorestart:false`, no queries, removed after; the prod
automation app + the 5 real pm2 apps untouched; boot dump untouched; **baseline restored + verified**). A minimal
`new PrismaClient(); await $connect()` + keep-alive probe (the charter's discriminator), on the prod host under the
deploy pm2 daemon.

| Probe | Supervision | Result |
|---|---|---|
| Prisma probe **wrapped in `strace -e trace=signal`** | pm2 fork | **Stable — 54 s online, 0 restarts, 0 SIGINT** in the trace. |
| Prisma probe **raw** (`node`, no strace) | pm2 fork | **Stable — 22 s+ online, 0 restarts, no received SIGINT.** |

**Primary finding — the phenomenon does NOT reproduce in the current environment/session (2026-07-23).** The same
minimal probe that SIGINT-looped on 2026-07-22 now runs **stably well past the ~3–4 s window**, both raw and traced.
This is decisive on the *nature* of the fault, if not yet the exact sender:

- **Confirms the fault is CONDITIONAL / transient**, gated on a factor present during the 2026-07-22 operational
  window and **absent now** — matching the 2026-07-10 web recovery.
- **Strengthens H1 (session-bound agent) / H4 (environment-level manager);** **weakens H2/H3** (an intrinsic
  pm2×Prisma or node/tsx cause would reproduce now — it does not). The root-owned `code-server` is *running now* yet
  the probe is stable now, which **partially exonerates** it as the sender.

**Attribution (sender pid/uid/comm) not yet obtained — and why:**
1. **Nothing to trace right now** — with the SIGINT not firing, there is no signal to attribute.
2. **Tooling wall for the deploy user:** `bpftrace`/`auditd` require **root** (no non-interactive `sudo`); `perf`
   is blocked (`perf_event_paranoid=4`); `strace` (the only same-uid option) both **perturbs** the process (a heavily
   ptraced process may not present the state the sender keys on) and had **no signal to catch**.

**Revised next step (needs a root-level, always-on watch — a decision point):** because the fault is *intermittent*,
attribution requires a **low-overhead `signal:signal_generate` watch left running** so it captures the sender the
*next* time the condition recurs (or during a deliberate reconstruction of the 2026-07-22 operational context):
`sudo bpftrace -e 'tracepoint:signal:signal_generate /args->sig==2/ { printf("%s SIGINT tgt=%d(%s) by=%d(%s) uid=%d\n", strftime("%H:%M:%S",nsecs), args->pid, args->comm, pid, comm, uid); }'` (or an `auditd` signal rule). This
requires **root**, which the deploy user lacks non-interactively — so it needs the founder to run it (e.g. via `!`)
or to grant elevated access for the trace. **Per AC-D27-5, no runtime change until the sender is positively
identified.**

## 12. Disposition — latent intermittent defect (2026-07-23)

**Status: OPEN (Monitoring)** — *not* Active Development. The platform proceeds on other work; D27 waits, tooling
armed, for the next occurrence to yield the missing evidence.

**Classification: latent intermittent defect.** The fault is real (evidenced 2026-07-22) but **not currently
reproducible** and **conditional** on a transient session/environment factor. Rather than spend disproportionate
effort forcing a reproduction of an intermittent issue, D27 stays **open** with attribution tooling **ready to
capture the next occurrence** (observe → identify → attribute → remediate, in order).

**Standing posture (until the next recurrence):**
- **Investigation OPEN** — root cause not yet established; sender unidentified.
- **Automation runtime DISABLED** — not started, not in the pm2 boot dump; `AUTOMATION_SCHEDULER_ENABLED=0` (ARI-4).
- **Do NOT force a reproduction** — low value for an intermittent fault.
- **Attribution tooling READY** — `scripts/d27-signal-watch.sh` (inert until run as **root**): arms a low-overhead
  `signal:signal_generate` watch (bpftrace, or an auditd fallback) that logs the SIGINT **sender** pid/uid/comm to a
  persistent file. Least-privilege (Option 1): the founder arms it when convenient; the next recurrence is captured.
- **No runtime/supervision/config change** — AC-D27-5 gate: `unknown sender → no change`.

**Sign-off (2026-07-23):**
| Item | State |
|---|---|
| Read-only investigation | ✅ Accepted |
| Controlled attribution experiment | ✅ Accepted (baseline restored; prod pristine) |
| Root cause | ⛔ Not yet established |
| Evidence quality | ⬆ Improved — fault localized to a transient session/env sender; app/pm2/Prisma/tsx intrinsic causes weakened |
| Runtime modifications | ⛔ Not authorized |
| Next gate | **Capture sender attribution (AC-D27-1) on the next recurrence**, then propose remediation (AC-D27-5) |
