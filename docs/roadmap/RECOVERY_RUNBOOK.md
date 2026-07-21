# Deploy Recovery Runbook (`deploy --recover`)

> **Short by design** — recovery is rare. Use this when a deployment was **interrupted** (killed / OOM /
> disconnect / reboot) and left a stale lock. Recovery is **explicit and evidence-based** (D26); it never
> runs silently. Successful deploys never need it.

---

## When to use it
A normal deploy refuses with something like:
```
✋ a stale/unknown deploy lock is present (STALE, phase BUILD) — run `deploy --recover` before deploying
```
…or you know a deploy process died mid-run (SIGTERM/SIGKILL/OOM, SSH drop, host reboot). Symptom: a
`.deploy.lock/` directory remains and no deploy is actually running.

**Do NOT use it** if a deployment is genuinely in progress — `--recover` will report `REFUSE_BUSY` and do
nothing, which is correct. Wait for the running deploy instead.

## Prerequisites
- Run as **`deploy`** (never root), on the deploy host.
- Same fail-closed gating as a deploy: `--app-dir <path>` (required), `--production` for a sentinel-marked
  target, and `--yes` (recovery can roll back, so it is a mutating op).

## Command
```
# Production (only if an interrupted deploy actually occurred):
node scripts/deploy/deploy.mjs --recover --app-dir /opt/crowdexpanse/commercial --production --yes

# Staging:
node scripts/deploy/deploy.mjs --recover --app-dir /opt/crowdexpanse/staging-commercial \
     --pm2-app crowdexpanse-commercial-staging --port 3040 --yes

# Inspect first (JSON, no color): add --json
```
It prints the **observation** (pid/host/phase/`.next` target), the **classification + recommendation**, the
**actions taken**, and writes a report (below). It is **idempotent** — safe to re-run; a second run with no
lock reports `NONE`.

## Expected classifications → recommended actions
| Classification | When | Action taken |
|---|---|---|
| `NONE` | no lock present | nothing — already clean |
| `ACTIVE` → `REFUSE_BUSY` | owner process alive (PID + `/proc` cmdline match) | **nothing** — a deploy is running; do not force |
| `STALE` (phase PRECHECK/BUILD/VERIFY_BUILD) | died **before** swap | `CLEAN` — drop lock + delete the partial release + generated tsconfig; **live release untouched** |
| `STALE` (phase SWAP/RESTART/VERIFY_RUNTIME/SMOKE, `.next`→new) | died **after** swap, unverified | `ROLLBACK` — repoint `.next` → previous release + restart + health, delete partial, drop lock |
| `STALE` (phase SWAP…, `.next`→NOT new) | swap didn't land | `CLEAN` |
| `STALE` (phase COMPLETE) | deploy had finished | `FINALIZE` — prune + drop lock |
| `UNKNOWN` → `MANUAL` | lock metadata missing/corrupt | **no automatic action** — inspect manually (see below) |

## Recovery report location
Each run writes `<app>/deploy-history/recover-<stamp>.json` — original lock evidence, observation, decision,
actions, timestamps, ok/fail. Keep it with the incident notes.

## After recovery
- Verify: `.next` is a symlink to a valid release, `/api/health` returns `"status":"ok"`, pm2 `online`.
- Then re-run the intended deploy normally (`deploy … --production --yes`). Idempotency means a re-run of the
  same release is a safe no-op.

## `MANUAL` (corrupt/unknown) — what to do
Do **not** guess. Inspect `.deploy.lock/lock.json` and the actual `.next` target:
- If `.next` is a valid symlink to a good release and health is ok → the live release is fine; you may
  remove the stale `.deploy.lock/` after confirming no deploy is running.
- If `.next` looks wrong → repoint it to the last known-good `releases/<stamp>` (`ln -sfn`), `pm2 restart`,
  verify health, then remove the lock. Capture what you did.

## What NOT to do
- Don't delete `.deploy.lock` by hand while a deploy is actually running.
- Don't `--force` a deploy to "get past" a lock — run `--recover` first.
- Don't migrate/reuse build artifacts between releases (Engineering Baseline #10); recovery deletes partial
  releases for this reason.

---
*D26 recovery is a rarely-used safety net; the successful deploy path (D25) is unchanged. See
[D26 design](./D26_INTERRUPTED_DEPLOY_RECOVERY_DESIGN.md) + the [Deployment Baseline](./DEPLOYMENT_BASELINE.md).*
