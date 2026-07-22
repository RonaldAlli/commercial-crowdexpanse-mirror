# D19 — Automation Runtime · Investigation + Fix (acceptance-first)

> **Investigation (Phase 1–3) reproduced the crash in STAGING BEFORE any change; Option A then implemented +
> verified against a CLEAN `npm ci --omit=dev` install + full Phase 4 runtime acceptance (19/19). Production
> UNTOUCHED throughout — `crowdexpanse-automation` never started; scheduler kill-switch stays OFF.**
> **STOP POINT: awaiting review before any production scheduler enablement.** 2026-07-22.
>
> — See **[Implementation (Option A) + Phase 4 acceptance](#implementation-option-a--phase-4-acceptance)** below.
> The Phase-2 note that `node --import tsx` was "known/proven" was treated as a hypothesis and has now been
> validated against a real production-style dependency graph (not just the source tree).

---

## Defect
The automation runtime process **`crowdexpanse-automation`** (PM2, declared in `ecosystem.config.js`,
deliberately inert — scheduler kill-switch `AUTOMATION_SCHEDULER_ENABLED` default `0`) is launched as:
```
node scripts/automation-runtime.mjs        (cwd /opt/crowdexpanse/commercial, NODE_ENV=production)
```
The `.mjs` entrypoint statically imports `.ts` source with explicit extensions:
```js
import { prisma } from "../lib/prisma.ts";
import { handlers, seeders } from "../lib/automation/registry.ts";
import { startExecutorLoop } from "../lib/automation/executor.ts";
import { runSchedulerOnce } from "../lib/automation/scheduler.ts";
import { reapStaleJobs } from "../lib/automation/reaper.ts";
```
Plain Node cannot load `.ts` → the process **crashes at STARTUP, before any DB connection or job execution.**

## Evidence — Phase 1 reproduction (staging, exact + unmodified)
```
$ node scripts/automation-runtime.mjs
node:internal/modules/esm/get_format:189
  throw new ERR_UNKNOWN_FILE_EXTENSION(ext, filepath);
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for …/lib/prisma.ts
  code: 'ERR_UNKNOWN_FILE_EXTENSION'
EXIT CODE: 1   ·   node v20.20.2   ·   cwd correct   ·   DATABASE_URL = commercial_crowdexpanse_test
```
Failure class: **startup / unknown `.ts` extension (missing loader)** — not ESM/CJS mismatch, not
import-resolution of app modules, not env, not DB, not a job-execution exception.

## Phase 2 — runtime-command matrix (diagnostic; ~8 s each; rc=124 = started+healthy, killed)
| Command | Result | Notes |
|---|---|---|
| `node scripts/automation-runtime.mjs` (current) | **rc=1 crash** | `ERR_UNKNOWN_FILE_EXTENSION` |
| `node --import tsx scripts/automation-runtime.mjs` | **STARTED** (rc=124) | tsx registers the `.ts` loader ✅ |
| `node --loader tsx scripts/automation-runtime.mjs` | **rc=1 crash** | `tsx must be loaded with --import instead of --loader` (deprecated flag) |
| `npx tsx scripts/automation-runtime.mjs` | **STARTED** (rc=124) | tsx runner ✅ |
| compiled-JS entrypoint | **N/A** | no build emits standalone automation `.js`; entrypoint is `.mjs` importing `.ts` |
*(Started = no crash; the executor idles on the empty test-DB queue. Job-processing acceptance is Phase 4,
post-review.)*

## Phase 3 — dependency / install analysis (the decisive constraint)
- **`tsx` is a `devDependency` (`^4.19.2`)**, `dev=true` in `package-lock.json`.
- **`npm ls tsx --omit=dev` → `(empty)`** — a production-style install does **NOT** include tsx.
- The **current** prod checkout HAS tsx (devDeps were installed) — so `--import tsx` would work *right now*,
  but a clean `npm ci --omit=dev` would **silently remove tsx** and re-break the runtime.
- The **D25 deploy engine does NOT run `npm install`** (it builds against existing `node_modules`) — so a
  clean prod install is a separate operational event; the fix must survive it, not merely the current checkout.
- No compiled automation `.js` exists (automation is `.ts` only; `next build` doesn't emit a standalone
  automation bundle).

**⇒ `node --import tsx` alone is INSUFFICIENT: it depends on tsx being resolvable at runtime, which a prod
`--omit=dev` install removes.**

## Preliminary root cause
The automation runtime executes TypeScript (`.mjs` → `.ts` imports) under plain Node with **no `.ts` loader
present at runtime in a production dependency set.** Two coupled facts: (1) no loader is wired into the launch
command; (2) the only loader (`tsx`) is a devDependency omitted by production installs.

## Minimal fix options (for review — NOT implemented)
| | Option | What changes | Survives `--omit=dev`? | Cost/risk |
|---|---|---|---|---|
| **A (recommended)** | `--import tsx` **+ promote `tsx` to `dependencies`** | `ecosystem.config.js` automation app gets `node_args: "--import tsx"`; move `tsx` devDep→dep | **Yes** (tsx becomes a runtime dep) | Minimal; adds a transpile-on-load loader to a background process (acceptable); tsx now shipped to prod |
| **B** | Precompile the automation runtime + its `lib` to `.js` (tsc/esbuild build step) and run the compiled entrypoint | new build step + `ecosystem` script → compiled JS | **Yes** (no tsx at runtime) | More work (build config, output dir, keep in sync); no runtime transpile |
| **C** | Convert the automation runtime + lib to `.mjs`/`.js` (drop `.ts`) | large source rewrite | Yes | Highest; loses TS types |

**Recommendation: A** — smallest change, and it directly matches the failure. The essential, non-obvious part
is **promoting `tsx` to `dependencies`** (verified against `--omit=dev`), not just adding `--import tsx`.

## Phase 4 — acceptance criteria (staging, before any prod authorization)
The runtime is NOT "fixed" until staging proves, **after a clean production-style install** (`npm ci
--omit=dev`) with the chosen fix:
1. Executor **starts cleanly** with the intended production command (pm2 `crowdexpanse-automation`).
2. Stays **online** for an observation period.
3. Claims/processes **one safe, clearly-tagged synthetic job** (test org, staging queue).
4. Successful job state **persisted** correctly.
5. A **failed** job is handled + recorded **without crashing** the worker.
6. **Restart** does not **duplicate** completed work (idempotency).
7. **Missing/malformed** job input does not terminate the process.
8. Works after the **clean `--omit=dev` install** (the decisive check).
9. **No change** to the web app process (`crowdexpanse-commercial`).
10. **Production untouched** until separate authorization.

## Phase 5 — safety boundaries (held)
Reproduction used STAGING only, the isolated **test DB**, scheduler **OFF**, synthetic invocation, no real
queue. For implementation/verification: do NOT start the executor against the prod DB, process real queued
jobs, change prod PM2, add retries before idempotency is understood, mutate/clear queues, or bundle unrelated
automation features into the runtime repair. Use a dedicated staging queue / test org / tagged synthetic job.

## Stop point
Reproduction + matrix + dependency analysis complete; root cause + options documented. **Awaiting review of
the fix option (A vs B) before implementation.** Then: implement on an isolated branch → verify against a
clean `--omit=dev` install in staging (Phase 4 acceptance) → review → and only then a separately-authorized
production enablement (which stays gated by the `AUTOMATION_SCHEDULER_ENABLED` kill-switch regardless).

---

## Implementation (Option A) + Phase 4 acceptance
Founder approved **Option A**. Implemented on branch `fix/d19-automation-runtime-tsx-dep` (from `main 00f429f`).

### The change (two edits, no app-logic change)
1. **`package.json`** — moved `"tsx": "^4.19.2"` from `devDependencies` → `dependencies` (lockfile
   regenerated: `node_modules/tsx` now `dev=false`; `npm ls tsx --omit=dev` → `tsx@4.19.2`, previously empty).
2. **`ecosystem.config.js`** — the `crowdexpanse-automation` app gets `node_args: "--import tsx"` (tsx requires
   `--import`, not `--loader`). The web app (`crowdexpanse-commercial`) is **untouched**.

### Decisive clean-install verification (the founder's gate — dependency graph, not source tree)
Fresh `git clone` → `npm ci --omit=dev` in a throwaway checkout (`/opt/crowdexpanse/d19-clean-verify`):
| Check | Result |
|---|---|
| `npm ls tsx` (clean `--omit=dev` tree) | **`tsx@4.19.2` present** (was `(empty)` before the fix) |
| Baseline `node scripts/automation-runtime.mjs` (unfixed cmd, same clean tree) | still **rc=1 · `ERR_UNKNOWN_FILE_EXTENSION`** (repro holds) |
| Fixed `node --import tsx scripts/automation-runtime.mjs` | **STARTED** · `runtime starting · scheduler=off · handlers=1` · drains cleanly on SIGTERM |

### Phase 4 runtime acceptance — `scripts/d19-runtime-acceptance.mjs` (19/19)
A durable harness that spawns the **real PM2 entrypoint** (`node --import tsx …`, scheduler OFF) against the
`*_test` DB with a throwaway org + synthetic tagged jobs (distinct from `e2e-automation.mjs`, which tests the
lib functions). Proves: (1) boots under the production command — no D19 crash; (2) in-process executor drains
the queue; (3) success **persisted** (SUCCEEDED / ALLOW / `producedDomainEffect=false` / AUTOMATION principal);
(4) a failed job (unknown type) **dead-letters without crashing** the worker; (5) missing/malformed input →
clean **NOOP**, process stays up; (6) **graceful SIGTERM** → exit 0, "stopped cleanly"; (7) **restart** claims
new work but records **no new executions for terminal jobs** (idempotent); (8) same-identity re-enqueue → one
job. Maps to acceptance criteria 1–7,9 (8 = the clean-install check above; 10 = prod untouched).

### Out-of-scope finding (recorded, NOT fixed in D19)
**Shutdown latency:** `shutdown()` awaits `reaper.stop()`, whose interval-loop sleeps on a
**non-interruptible** `AUTOMATION_REAPER_INTERVAL_MS` (default **30 s**). A clean drain can therefore lag up to
that interval — and PM2's default `kill_timeout` (~1.6 s) would `SIGKILL` the process before it drains. This is
a **pre-existing** property of the reaper loop, unrelated to the startup crash D19 fixes; the acceptance
harness sets a short interval to exercise the drain deterministically. → Candidate follow-up: make the
interval sleeps interruptible on stop (or shorten the interval + raise PM2 `kill_timeout`). Not changed here.

### Gate (branch)
`tsc` 0 · unit **73 files** · e2e **43 scripts** · `build:isolated` ok. Frozen kernels untouched (docs +
`package.json`/`ecosystem.config.js` + one new acceptance script only). See also the
[devDependency runtime audit](./DEVDEP_RUNTIME_AUDIT.md) (the follow-up: D19 closed the only prod-runtime
devDep gap; the remaining devDep usage is the build step, which is by design).

---
*Stop point: **Option A implemented + clean-`--omit=dev`-verified + Phase 4 accepted (19/19), gate green.**
Branch `fix/d19-automation-runtime-tsx-dep`, NOT merged, NOT deployed. `AUTOMATION_SCHEDULER_ENABLED` stays
`0`; the executor is not started in production. **Awaiting review before merge/deploy and, separately, before
any scheduler enablement.***
