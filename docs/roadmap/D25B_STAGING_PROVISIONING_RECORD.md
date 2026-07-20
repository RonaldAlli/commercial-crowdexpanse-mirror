# D25b · Staging Provisioning + Isolation-Proof Record

> **Staging instance provisioned per the [Manifest](./D25B_STAGING_MANIFEST.md) on 2026-07-20.** Isolation
> from production PROVEN. **The rehearsal has NOT begun** — stopped for review, AND a blocking engine
> defect (DE-1, below) surfaced during provisioning must be resolved first. Production untouched.

---

## 1. What was provisioned (matches the manifest)

| Item | Value |
|---|---|
| Directory | `/opt/crowdexpanse/staging-commercial` (fresh `git clone` of `main @ b628f89`; no prod `.env`/`.next`/`node_modules` copied — `node_modules` copied separately, identical at same commit) |
| PM2 process | `crowdexpanse-commercial-staging` (id 4), **online**, restart_time 0 |
| Port | **127.0.0.1:3040** only (verified via `ss` — not publicly bound) |
| `.next` model | symlink → `releases/20260720T062413Z` (BUILD_ID `Yeure0zBX8FnqOTJVFYlt`); `.release-id` + `release.json` written |
| Database | `commercial_crowdexpanse_test` (migrate deploy: 30 migrations, none pending) |
| Uploads | `/tmp/commercial-staging-uploads` |
| Email | `console` (no real mail) |
| pm2 save | **NOT run** (staging absent from resurrect list; disposable) |

## 2. Isolation proof — PASSED (production untouched)

Prod baseline (before): `crowdexpanse-commercial` pid **299921**, restart_time **96**, health 200.

| # | Check | Result |
|---|---|---|
| 1 | Staging healthy (3040) + prod healthy (3030) | ✅ both 200; staging DB connected (`dbMs≈1.4`) |
| 2 | **Stop staging** → prod healthy | ✅ staging 3040 → connection refused; prod 3030 → 200 |
| 3 | **Kill/stop staging PM2** → prod unaffected | ✅ prod pid 299921, restart 96 unchanged |
| 4 | Staging writes only to test locations | ✅ DB `…_test`, uploads `/tmp/commercial-staging-uploads` |
| 5 | Prod metrics unchanged across all staging ops | ✅ pid 299921 / restart 96 / health 200 — identical before, during, after |
| 6 | Networking isolation | ✅ staging bound `127.0.0.1:3040` only |

Staging restored **online** after the drill, idle, ready for the rehearsal **after review**.

## 3. Finding DE-1 (engine defect surfaced by provisioning) — BLOCKS the rehearsal's build/deploy step

**What:** `next.config.mjs` sets `distDir: process.env.NEXT_DIST_DIR || ".next"`, and Next **joins**
`distDir` onto the project root. The Deployment Engine's `ops-real.mjs` `build()` passes `NEXT_DIST_DIR`
as an **absolute** path (`releaseAbs(stamp)` = `<appDir>/releases/<stamp>`). Next then computes
`path.join(appDir, <absolute>)` → a **nested** dir (`<appDir>/opt/crowdexpanse/.../releases/<stamp>`), so
the build output does **not** land at the expected `releaseAbs`, and `VERIFY_BUILD` would fail to find
`BUILD_ID`. Reproduced live during staging provisioning (the stray `opt/…` tree; relocated to fix staging).

**Impact:** the engine's real `build → verify` cannot succeed as written — the rehearsal's *Normal
Deployment* step would fail. Sandbox tests didn't catch it because they inject a fake `build` op; this is
a real-ops/host-integration defect — exactly what a rehearsal is meant to surface.

**Fix (one line, low risk):** pass the **relative** release dir to Next, so it joins correctly:
```
// ops-real.mjs build():  NEXT_DIST_DIR must be RELATIVE to appDir
env: { ...process.env, [distDirEnv]: releaseRel(stamp) }   // was: releaseAbs(stamp)
```
`releaseRel(stamp)` (`releases/<stamp>`) already exists; `built.absDir` (absolute) stays for fs checks —
Next resolves `path.join(appDir, "releases/<stamp>")` === `absDir`. No other change needed.

**Disposition:** report-before-code + the standing "no further D25a engineering without authorization"
directive → **not fixed yet.** This is a prerequisite correction for the rehearsal. Recommend authorizing
this one-line fix (with a real-ops build assertion so it's covered), then run the rehearsal.

## 4. Status

- ✅ Staging provisioned + isolation proven; production untouched (pid 299921 / restart 96 throughout).
- ⛔ **Rehearsal BLOCKED pending:** (a) this review, and (b) authorization of the DE-1 one-line engine fix.
- The rehearsal (dry-run → forced-failure → rollback → recovery → 2nd dry-run → normal deploy → smoke,
  with §4a timings) runs only after both clear.

---
*Stop point: provisioning + isolation complete. Awaiting review + a decision on DE-1 before the rehearsal.*
