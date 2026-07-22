# D19 — Automation Runtime · Investigation (acceptance-first, reproduction gate)

> **Phase 1–3 done in STAGING (test DB, scheduler OFF, synthetic). Reproduced the crash BEFORE changing any
> dependency / startup command / PM2 config / app code. Production UNTOUCHED — `crowdexpanse-automation` was
> never started (not in the pm2 list).** No implementation. `node --import tsx` is treated as a HYPOTHESIS to
> validate against a clean production-style install — NOT a conclusion. 2026-07-22.

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
*Stop point: D19 present failure REPRODUCED (`ERR_UNKNOWN_FILE_EXTENSION`, startup); `--import tsx` starts but
`tsx` is a devDep omitted by prod installs → the durable fix must promote tsx (or compile). Prod untouched.
Awaiting review of the minimal-fix option.*
