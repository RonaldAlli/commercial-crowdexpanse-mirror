# DE-5 — Deploy tsconfig type-checks sibling releases (blocks the first engine prod deploy)

> **Found on the FIRST real production deploy via the D25 engine (deploying the Deal Analyzer fix).
> Production is UNTOUCHED — the build failed BEFORE swap; the engine's fail-before-swap design held.
> Reporting before touching the frozen engine or a live release.** 2026-07-22.

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
*Stop point: first prod engine deploy blocked by DE-5 (deploy tsconfig type-checks sibling release #1's
depth-mismatched types). Prod safe. Awaiting direction before modifying the live release or the frozen engine.*
