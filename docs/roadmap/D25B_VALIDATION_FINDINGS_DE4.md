# D25b · Clean Staging Validation — did NOT complete cleanly (contamination + DE-4)

> **Ran the corrected CLI + engine against staging. The safety model worked exactly as intended, but the
> validation BUILD failed — surfacing a provisioning-contamination issue and a genuine engine finding
> (DE-4). Production unaffected. Rehearsal remains blocked. Awaiting direction.** 2026-07-20.

---

## 1. What PASSED (the DE-2/DE-3 safety model works)

- **Sentinel verification (abort-only)** — all correct: prod without `--production` → refused; prod with
  `--production` but no `--yes` → refused; staging → accepted; `--production` on an unmarked target → refused.
- **CLI fail-closed** resolved staging correctly and printed the resolved-context banner.
- **DE-3 PRECHECK** passed on staging (migrated symlink model) and the engine reached BUILD — i.e. the
  target validation correctly *allowed* the right target and would have *rejected* the wrong one.

## 2. What FAILED — the validation BUILD

`next build` (inside the dry-run) failed at its **type-check** phase:
```
.next/types/app/(workspace)/activity/page.ts
  Cannot find module '../../../../../../../../../app/(workspace)/activity/page.js'   (NINE ../)
```

## 3. Root cause 1 — staging contamination (my provisioning shortcut)

Staging's active release `20260720T062413Z` was built **during provisioning with the DE-1 absolute-distDir
bug** (output nested at `…/staging-commercial/opt/crowdexpanse/staging-commercial/releases/<stamp>`), then
**moved** into `releases/`. Next's generated route-type files kept the **deep (9×`../`)** relative paths of
that nested location, so after the move they no longer resolve. **Fix: re-provision staging's active
release with a CLEAN build (rebuild via the corrected engine — never move a mis-built release).**

## 4. Root cause 2 — DE-4 (genuine engine finding): build type-check is bound to `.next/types`

`tsconfig.json` hardcodes `include: [".next/types/**/*.ts", ".next-isolated/types/**/*.ts"]`. `next build`
generates route types into **`<distDir>/types`**, but the type-check only *includes* `.next/types`. In the
Deployment Engine's model the build's `distDir` is `releases/<stamp>` while `.next` is a **symlink to the
ACTIVE (previous) release** — so a new release's build type-checks the **previous** release's types, not
its own:
- If the active release's types are valid → the build **passes but validated the wrong release** (silent
  correctness gap).
- If they're stale/corrupt (our case) → the build **fails**.

**Scope:** this affects the **engine's** per-release custom-`distDir` build. The *current* production deploy
(in-place `distDir=.next`) does **not** hit DE-4 (`.next/types` == the build's own types). So DE-4 blocks
the **engine**, not today's deploys.

**Options (need a decision):**
- **(A, recommended) Decouple the release build's type-check.** The deploy pipeline already runs a
  comprehensive `tsc --noEmit` in the gate *before* building, so the release build re-checking a
  hardcoded/mismatched types dir is redundant. Gate `typescript.ignoreBuildErrors` behind an env flag
  (e.g. `DEPLOY_RELEASE_BUILD=1`) so only engine release-builds skip Next's internal type-check; normal
  `next build` / `build:isolated` are unchanged.
- **(B)** Emit a per-build tsconfig that includes `releases/<stamp>/types` for the build. More moving parts.
- **(C)** Point `.next` at the new release before building — rejected: breaks the atomic "build off to the
  side, then swap" model.

## 5. Production impact — none

Dry-run only; no swap/restart. Prod `crowdexpanse-commercial` pid 299921 / restart 96 / health 200 —
unchanged. The failed run's staging residue (partial release + history record) was removed; staging still
healthy on 3040 serving its prior release.

## 6. Recommendation + stop

1. **Re-provision staging's active release cleanly** (rebuild, don't move) — part of restarting the
   validation from Phase 1.
2. **Decide DE-4** (recommend option A) and implement it as its **own fix milestone** (isolated branch →
   fix → regression test → gate → review → merge), exactly like DE-1/DE-2/DE-3.
3. Only then re-run the clean staging validation; if it completes cleanly, stop for review before the
   D25b rehearsal.

**The rehearsal remains blocked.** No further engine runs until DE-4 is resolved + staging re-provisioned.

---
*Stop point: validation surfaced contamination + DE-4. Awaiting direction on the DE-4 approach and the
clean staging re-provision.*
