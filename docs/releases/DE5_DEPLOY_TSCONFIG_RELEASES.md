# DE-5 — Deploy tsconfig type-checks sibling releases (blocks the first engine prod deploy)

> **✅ FIXED + PRODUCTION-VERIFIED · CLOSED 2026-07-22.** Found on the first prod engine deploy (build failed
> BEFORE swap — prod untouched); fixed as an engine correction (deploy tsconfig excludes build-output/release
> dirs), staging-reproduced + regression-tested, then the analyzer deploy succeeded through the corrected
> engine (full PRECHECK→…→COMPLETE, build `iV84TbmJSWasU9XBvMmdQ`). Frozen-engine baseline moves: `main b5bdb4c`.

---

## What happened
`deploy.mjs --app-dir /opt/crowdexpanse/commercial --production --yes` failed at **BUILD**:
```
./releases/20260721T110934Z/types/app/(workspace)/activity/page.ts:2:24
Type error: Cannot find module '../../../../../app/(workspace)/activity/page.js'
```
Then: `[ROLLBACK] skipped — no swap occurred — live release never changed`. Prod still serves
`AKUhg2gFVCyjthMDVFvL3`, health 200, pm2 restart 97 / unstable 0. My failed-build residue (a partial
`releases/<stamp>`) was removed; no stale lock; `tsconfig.deploy.json` cleaned.

## Root cause
- **Release #1 (`releases/20260721T110934Z`) is the D25b migration's COPY of the original in-place-built
  `.next`** (built with `distDir=.next`, depth 1). Its generated route-types have **depth-1** relative paths
  (`../../../../../app` = 5 `../`). The dir now lives at `releases/<stamp>` (**depth 2**).
- The engine's DE-4 deploy tsconfig is `{ extends: "./tsconfig.json", include: ["next-env.d.ts", "**/*.ts",
  "**/*.tsx"] }`. The **`**/*.ts` glob matches `releases/20260721T110934Z/types/**/*.ts`** — release #1's
  depth-1 types, now at depth-2 → they don't resolve → the build's type-check fails.
- So **every engine deploy fails while release #1 (the migration copy) is present** and matched by `**/*.ts`.
  It did NOT surface in staging because all staging releases were **engine-built** (correct depth-2 types
  that resolve even when cross-checked).

This is a **DE-4 gap**: the deploy tsconfig should type-check the app source + the CURRENT build's types only
— **not** sibling releases' generated types. (`types/` is a build-time artifact; the running server never
uses it.)

## Options
| | Approach | Risk | Durability |
|---|---|---|---|
| **A (minimal unblock)** | Delete release #1's stale `types/` dir (unused at runtime — the server serves `server/`/`static/`/`BUILD_ID`, and rollback re-serves the same). Then re-deploy. | Low (removes an unused build-time artifact from the active release) | Unblocks now; latent gap remains only for a *future* migration-copied release (there won't be more — the migration is one-time; future releases are all engine-built) |
| **B (proper engine fix — DE-5)** | Make the deploy tsconfig **exclude `releases/`** (`makeDeployTsconfig` → add `"exclude": ["releases"]`, or scope `include` to source dirs). Regression test + gate + review. | Small change to the FROZEN D25 engine (own milestone/authorization) | Robust — sibling releases never type-checked again |

## Recommendation
Do **A** to unblock the urgent Deal Analyzer deploy now (safe artifact cleanup, no code/engine change, no
touch to the running app), **and** open **B (DE-5)** as the proper engine follow-up. Both need the founder's
nod because A modifies a live release's contents and B changes the frozen engine.

## Status
- Deal Analyzer fix is **merged (`main b76bda7`) + staging-verified + regression-tested** — it simply hasn't
  shipped because the engine build is blocked by DE-5.
- Production untouched + healthy. Restore-verified backup `20260722-001505Z` on hand.
- **Awaiting decision:** proceed with A (unblock + re-deploy) now, and/or schedule B (DE-5 engine fix).

---

## Resolution — Option B implemented (branch `fix/d25-de5-deploy-tsconfig-exclude`, PENDING REVIEW)
Founder chose **B** (engine fix, NOT the manual release deletion). Production release **unchanged**.

- **Fix (`makeDeployTsconfig`):** the deploy tsconfig now **excludes build-output + release dirs** so `**/*.ts`
  can't type-check them:
  ```js
  exclude: ["node_modules", ".next", ".next-isolated", ".next-visual", "releases", "deploy-history"]
  ```
  This scopes the deploy build's type-check to the **source tree**; the current build's routes are still
  compiled by Next. (`.next` is excluded too — it's the symlink to the active release, another path to the
  same sibling types.) No application behavior change; committed `tsconfig.json` untouched.
- **Reproduced in staging** (production-like migrated-release layout — a sibling release with a
  depth-mismatched generated type): the **OLD** deploy tsconfig fails with the exact prod error
  (`TS2307: Cannot find module '../../../../../app/(workspace)/activity/page.js'`); the **NEW** one passes.
- **Regression test** `tests/unit/deploy/de5-migrated-release.test.mjs` (self-contained: reproduces the OLD
  failure + asserts the fix passes + source still checked) + config assertions in `ops-real-deploy-tsconfig.test`.
- **Engine end-to-end (staging, migrated-sibling present):** `PRECHECK → BUILD → VERIFY_BUILD → SWAP →
  RESTART → VERIFY_RUNTIME → SMOKE → COMPLETE`, DEPLOYED, health 200 — the sibling no longer breaks the build.
- **Gate:** tsc 0; unit **601**; e2e 43; build:isolated ok.

**Acceptance criteria — all met:** repro in staging ✅ · fix eliminates it w/o app change ✅ · analyzer fix
still passes all gates ✅ · migrated-release dir no longer causes TS failures ✅ · engine still runs
PRECHECK→…→SMOKE ✅ · migrated-release regression test added ✅.

---
*Stop point: DE-5 fixed + verified in staging (reproduction + regression + full engine sequence). Awaiting
review → merge → then redeploy the already-approved Deal Analyzer fix through the corrected engine. Prod
untouched (AKUhg2…, health 200).*
