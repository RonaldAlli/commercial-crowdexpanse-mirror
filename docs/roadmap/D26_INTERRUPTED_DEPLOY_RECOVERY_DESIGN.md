# D26 — Interrupted Deployment Recovery · Design (Phases 1–5)

> **Status: DESIGN · PENDING FOUNDER REVIEW — no recovery code.** Acceptance-first, per the
> [Engineering Baseline](./ENGINEERING_BASELINE.md). Independent of the now-frozen **D25** engine
> functionality (D25 = ACCEPTED · CLOSED). **Objective: make interrupted deployments self-describing and
> safely recoverable WITHOUT changing the behavior of a successful deployment.** Surfaced by the D25b
> rehearsal (a hard-killed deploy left a stale `.deploy.lock`).

---

## Phase 1 — Requirements (no code)

### 1.1 What "interrupted" means
A deployment is *interrupted* when the `deploy.mjs` process ends **without running its `finally`** (which
releases the lock + cleans the generated tsconfig). Scenarios + what each may leave behind:

| Scenario | `finally` runs? | State possibly left behind |
|---|---|---|
| **Operator Ctrl+C (SIGINT)** | Node runs `finally` on SIGINT only if not in a blocking syscall — often **partially** | stale lock likely; partial release |
| **SIGTERM** (e.g. `kill`, our command-timeout) | **No** (default: terminates without unwinding) | stale lock; partial release; maybe post-swap unverified |
| **SIGKILL / OOM kill** | **No** | same as SIGTERM |
| **SSH session disconnect** (SIGHUP) | usually **No** | same |
| **PM2 termination of the deploy** (if ever run under pm2) | **No** | same |
| **Host reboot / power loss** | **No** | stale lock from a **prior boot**; partial release; the app is restarted by pm2 resurrect on the *old or new* `.next` |

### 1.2 Guarantees the engine must provide (recovery contract)
1. A **live** deployment is never mistaken for a dead one (no false "stale").
2. A **dead** deployment's lock never blocks a new deploy indefinitely — it is detectable + recoverable.
3. Recovery **never corrupts** the live release: it either leaves the current good release serving or rolls
   back to the last known-good — never a partial/unverified state.
4. Recovery is **explicit + auditable** (a command + a report), not silent.
5. Recovery is **idempotent** and itself **re-runnable** if interrupted.
6. **Successful-deploy behavior is unchanged** (D25 frozen path untouched on the happy path).

### 1.3 Expected recovery by interruption point (see the recovery-state design, §2.3)
- **Before SWAP** (PRECHECK/BUILD/VERIFY_BUILD): live release never changed → recovery = drop the stale
  lock + delete the partial `releases/<stamp>` + the generated `tsconfig.deploy.json`. No rollback.
- **At/after SWAP, unverified** (SWAP/RESTART/VERIFY_RUNTIME/SMOKE): `.next` may point at the new release
  → recovery = roll back to the recorded **previous** release (repoint + restart + health), unless the new
  release is provably healthy (then complete-forward is allowed but roll-back is the safe default).
- **COMPLETE**: the deploy effectively succeeded → recovery = finish retention + release the lock.

---

## Phase 2 — Architecture

### 2.1 Evolve the lock: directory → evidence record
Today the lock is "a directory exists" (`fs.mkdirSync('.deploy.lock')`). D26 replaces the *decision basis*
(not the mutual-exclusion primitive) with a small **metadata record** written atomically inside the lock:
```json
{
  "pid": 12345,
  "host": "crowdexpanse-hub",
  "startedAt": "2026-07-21T11:10:11Z",
  "stamp": "20260721T110934Z",
  "release": "releases/20260721T110934Z",
  "previous": "releases/20260721T004532Z",
  "phase": "SWAP",
  "argv": "deploy --app-dir /opt/crowdexpanse/commercial --production --yes"
}
```
- The lock **directory** stays the atomic mutual-exclusion primitive (unchanged, so successful deploys keep
  serializing exactly as today). The **`lock.json`** inside it is the new evidence.
- `phase` is updated (atomic write-rename) as the engine advances (PRECHECK→BUILD→…→COMPLETE), so a reader
  can tell *where* an interrupted deploy died. `previous` is recorded at PRECHECK (for rollback scope).

### 2.2 Recovery model
```
Lock acquired (write lock.json: pid/host/startedAt/previous/phase=PRECHECK)
        ↓  phase updated per state
Unexpected termination  ──►  lock.json remains, owner process gone
        ↓
Next `deploy` (or `deploy --recover`) finds the lock and inspects lock.json:
        ↓
Validate OWNER      → is pid alive on THIS host AND its /proc cmdline still the deploy? 
        ↓                (alive+matching ⇒ a real deploy is running ⇒ REFUSE, not stale)
Validate AGE        → startedAt older than a max-deploy-duration threshold?
        ↓
Validate STATE      → read `phase` + the ACTUAL `.next` target (atomic ⇒ old or new, never partial)
        ↓
Recover:  pre-SWAP  → clean partial release + tsconfig.deploy.json + drop lock          (no rollback)
          post-SWAP → roll back to `previous` (repoint + restart + health) OR complete   (evidence-based)
          COMPLETE  → finish retention + drop lock
        ↓
Write a RECOVERY REPORT (what was found, decision, actions, final state) to deploy-history/
```

### 2.3 Recovery-state design (phase → left-behind → action)
| Recorded `phase` | `.next` points to | Recovery action | Rollback? |
|---|---|---|---|
| PRECHECK | previous (unchanged) | drop lock | no |
| BUILD / VERIFY_BUILD | previous (unchanged) | delete partial `release`; delete `tsconfig.deploy.json`; drop lock | no |
| SWAP | **new** (if rename landed) or previous | if `.next`==new & unverified → repoint→`previous` + restart + health; else drop lock | maybe |
| RESTART / VERIFY_RUNTIME / SMOKE | new | health-check new: healthy ⇒ complete-forward (retain) *or* (safe default) roll back to `previous`; unhealthy ⇒ roll back | usually |
| COMPLETE | new (verified) | finish retention; drop lock | no |

### 2.4 Two entry points
- **`deploy --recover`** (recommended primary): inspect-only-then-act. Prints what it found and what it will
  do; performs the §2.3 action; emits a recovery report. **Explicit + auditable.** No build/deploy.
- **A normal `deploy`** that encounters a lock: if the owner is **alive** → refuse (as today). If **stale**
  → it does **not** silently recover; it **refuses with a clear message pointing to `deploy --recover`**
  (keeps recovery a deliberate act). *(A future `--auto-recover` flag could opt into inline recovery; out of
  scope for D26.)*

---

## Phase 3 — Acceptance Criteria (measurable, defined before code)
1. **Stale locks detected correctly** — a lock whose owner PID is dead (or from a prior boot / different
   host) is classified stale.
2. **Active deployments never mistaken for stale** — a lock whose owner is alive + `/proc` cmdline matches is
   classified active; a concurrent deploy is refused.
3. **Interrupted deploy recovered safely** — for each phase in §2.3, recovery reaches a valid end state
   (good release serving OR rolled back to previous), verified by health + the single-active invariant.
4. **Recovery is idempotent** — running `--recover` twice yields the same clean state; the second run is a
   no-op with a report.
5. **Recovery survives its own interruption** — killing `--recover` mid-run and re-running completes cleanly.
6. **Production integrity maintained** — recovery never leaves `.next` non-symlink, dangling, or pointing at
   an unverified release; BUILD_ID continuity holds unless a rollback intentionally changed it.
7. **Rollback path preserved** — `previous` is always recoverable from `lock.json`; `.next.premigration` and
   retained releases remain valid.
8. **Successful deploys unchanged** — the D25 happy-path behavior + timings are unaffected (the lock.json
   write is O(1); no new state on the success path beyond the metadata file).

---

## Phase 4 — Risk Review (each with a mitigation)
| Risk | Mitigation |
|---|---|
| **PID reuse** (a dead deploy's PID reused by another process) | don't trust PID-alive alone — also verify `/proc/<pid>/cmdline` still names `deploy.mjs` **and** the process start-time ≥ `startedAt`; else treat as stale |
| **Clock skew** | single host, single clock ⇒ negligible; age threshold is generous; `startedAt` compared only against the same host's `now`; never compare across hosts |
| **Partially completed swap** | the swap is a single atomic `rename(2)` ⇒ `.next` is old **or** new, never partial; recovery reads the actual target as ground truth, not the (possibly-stale) `phase` |
| **Corrupted / unreadable `lock.json`** | fail **closed** — do NOT auto-decide; require explicit `deploy --recover`, which treats unknown state conservatively (verify `.next` target + roll back to a known-good release if a swap may have occurred) |
| **Concurrent operators / concurrent `--recover`** | `--recover` takes the same lock dir (or a recovery sub-lock) so two recoveries serialize; recovery is idempotent so the loser re-observes a clean state |
| **Interrupted recovery itself** | order recovery steps so each is safe to repeat; the last step is dropping the lock, so a re-run resumes; never delete `previous`/`.next.premigration` until the end state is verified |
| **Host reboot leaving a lock from a prior boot** | `startedAt` + a boot-id/uptime check (a lock older than system boot ⇒ definitely stale) |
| **False auto-recovery hiding a real problem** | recovery is **explicit** (`--recover`) + always writes a report; a normal deploy refuses + points to it rather than silently healing |

---

## Phase 5 — Implementation Plan (only after approval)
1. **Isolated branch**, narrow scope: extend the lock to write/read `lock.json` (metadata) at acquisition +
   phase transitions; add `assessLock()` (pure: metadata + liveness + age → active|stale|unknown); add a
   `deploy --recover` path invoking the §2.3 recovery; write a recovery report to `deploy-history/`.
2. **Regression tests** (sandbox, real symlinks — like the D25 engine tests): each interruption phase → the
   correct recovery + idempotency + interrupted-recovery re-run; active-lock-not-stale; PID-reuse guard;
   corrupted-metadata → fail-closed; successful-deploy path unchanged (metadata written, no behavior delta).
3. **Full gate** (tsc, unit incl. new tests, e2e, build:isolated) + a **staging drill**: reproduce a killed
   deploy at each phase on the isolated staging instance and prove `--recover` heals it.
4. **Review → merge.** No production execution as part of implementation; first host use of `--recover` is a
   staging drill, then documented for operators (Deployment Baseline anomaly guide updated).

**Non-goals (D26):** silent/auto inline recovery (reserved behind a future flag); changing the successful
deploy path; multi-host locking (single host today). No change to the frozen D25 happy-path semantics.

---
*Stop point: awaiting Founder review of Phases 1–4 + the recovery-state design before opening an
implementation branch or writing any recovery code.*
