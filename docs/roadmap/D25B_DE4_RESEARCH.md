# D25b · DE-4 Research — custom `distDir` × Next's tsconfig type-includes

> **Investigation milestone (no build-safety changes). Custom `distDir` is fully supported; NOT a case for
> `ignoreBuildErrors`.** 2026-07-21.
>
> **⚠️ CORRECTION (see §6, which SUPERSEDES §3–§4). The first pass concluded "the fresh-build invariant
> fixes DE-4" — that was WRONG: a fully clean rebuild STILL failed the build. The real root cause is a
> `.next`-symlink DEPTH MISMATCH (release dirs are depth-2 `releases/<stamp>`, `.next` is a depth-1
> symlink). The confirmed fix is to build each release against a tsconfig that OMITS the legacy
> `.next/types`/`.next-isolated/types` globs — empirically verified (build passes, type-checking stays ON).
> The fresh-build invariant (discipline #10) remains valid engineering but does NOT resolve DE-4.**

---

## 1. Question

Why did a release build (custom `NEXT_DIST_DIR=releases/<stamp>`, `.next` = symlink to the active release)
fail its type-check with `Cannot find module '../../../…/app/(workspace)/activity/page.js'` (9×`../`)?
Is custom `distDir` supported? Does the issue stem from `distDir`, `.next/types`, or project config?

## 2. Evidence (from Next.js source + observed behavior)

**Next intentionally wires the current `distDir`'s types into tsconfig — by APPEND, never prune.**
`node_modules/next/dist/lib/typescript/writeConfigurationDefaults.js`:
```
222   const nextAppTypes = `${distDir}/types/**/*.ts`;
235   } else if (hasAppDir && !rawConfig.include.includes(nextAppTypes)) {
236       userTsConfig.include.push(nextAppTypes);      // append only — old entries are never removed
```
**Observed** on a clean fresh build with `NEXT_DIST_DIR=releases/<stamp>`:
- `include` **before**: `["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts",".next-isolated/types/**/*.ts"]`
- `include` **after**:  `[… ,".next-isolated/types/**/*.ts","releases/<stamp>/types/**/*.ts"]`  ← Next added the release path.
- Types were generated in `releases/<stamp>/types` and the build **passed** (exit 0, no nesting).

## 3. Root cause

- **Custom `distDir` is supported.** Next adds `${distDir}/types` to `include`, so the current build's own
  types ARE type-checked. This is inherent, documented behavior — not a bug, not an incompatibility.
- **`include` accumulates.** Because Next only appends, the committed `tsconfig.json` still carries
  `.next/types` and `.next-isolated/types` from earlier builds. In the **symlink deploy model**, the
  `.next/types` glob resolves — via the `.next` symlink — to the **active (previous) release's** types. So
  every new release build ALSO type-checks the previous release's generated types.
- **The trigger was contamination, not `distDir`.** The active release had been built with the DE-1
  absolute-`distDir` bug and then **moved** into `releases/` (discipline #10 violation). Its route-types
  kept deep `9×../` paths that no longer resolved → the new build's type-check of `.next/types` failed.
  With a **cleanly built** active release (correct depth), that same re-check resolves and **passes**
  (redundant, but not failing).

**So the issue stems from `tsconfig` `include` accumulation × the `.next` symlink model, triggered by a
migrated (contaminated) build — NOT from `distDir` itself.**

## 4. Options for a permanent solution (recommendation: A; NOT D)

- **(A, recommended) The fresh-build invariant is the fix — no code/config change.** With
  [discipline #10](./ENGINEERING_BASELINE.md) (never migrate build artifacts; every release a fresh build),
  the active release's types are always valid, so the accumulated `.next/types` re-check passes. DE-4
  becomes benign. This is now codified and the staging active release has been rebuilt cleanly.
- **(B, optional hygiene) Engine resets `tsconfig.json` to the committed baseline before each build**
  (`git checkout -- tsconfig.json`). Prevents `include` from accumulating `releases/<stamp>/types` globs
  across many deploys in a persistent checkout (cosmetic; stale globs are otherwise harmless dead matches
  after retention prune). Low-risk, isolated to the engine's build op — a good follow-up, not required for
  correctness.
- **(C) Remove `.next/types` / `.next-isolated/types` from the committed `include`.** Rejected — `next dev`
  (distDir `.next`) and `build:isolated` (`.next-isolated`) legitimately need them; removing breaks local
  dev / the isolated build's type-check.
- **(D, last resort) `typescript.ignoreBuildErrors`.** **Rejected.** The investigation shows type-checking
  is neither broken nor incompatible; disabling it would reduce a real guarantee to paper over a
  contamination that the fresh-build invariant already prevents.

## 5. Status

- **Understood + documented.** Custom `distDir` supported; failure was contamination via `include`
  accumulation + the symlink model; fixed by the fresh-build invariant (discipline #10).
- **Staging re-provisioned clean** (fresh build `releases/20260721T004532Z`, BUILD_ID `faHGOUFc9cJcVI3XjU8BZ`,
  nothing moved); online + isolated; prod untouched (pid 299921 / restart 96 / health 200).
- **No build-safety settings changed** (per direction). Option B (tsconfig reset) offered as optional
  engine hygiene for a decision.
- **Expected next:** with the clean active release, a clean staging validation build (#2) should now pass
  its type-check — to be confirmed under authorization (validation resumes only on your go).

---

## 6. CORRECTION — real root cause is a `.next`-symlink DEPTH MISMATCH (supersedes §3–§4)

The clean staging validation (build #2, against a freshly rebuilt active release) **still failed** — so
§3–§4 were wrong. Evidence corrected the hypothesis:

- **Contaminated release** (moved DE-1 build): types had `9×../` → fail.
- **Cleanly rebuilt release**: types have **`6×../`** → **still fail** via `.next/types`.

**Why:** Next generates route-type relative paths for the build's `distDir` **depth**. `releases/<stamp>`
is **depth 2**, so the paths are `6×../` (correct *for that real location*). But `.next` is a **depth-1**
symlink, and the committed tsconfig includes `.next/types/**`. When the active release's types are
type-checked *through the `.next/types` glob* (depth 1), the `6×../` overshoots by exactly one level
(release depth 2 − `.next` depth 1) → `Cannot find module …/app/.../page.js`.

**Control:** `build:isolated` uses `NEXT_DIST_DIR=.next-isolated` (**depth 1**) and passes — depth-1 dirs
work; depth-2 release dirs under the depth-1 `.next` symlink do not. So it is a **structural symlink-depth**
issue, independent of contamination; the fresh-build invariant does **not** fix it.

**Confirmed fix (empirically verified in staging):** build each release against a tsconfig whose `include`
**omits `.next/types` and `.next-isolated/types`**, leaving only the release's own `releases/<stamp>/types`
(which Next auto-adds at the correct depth). Result: **build passes, exit 0** — the release's own types are
still fully type-checked; only the depth-mismatched symlink view is excluded. **No `ignoreBuildErrors`.**

### Revised options (for decision — this is an ENGINE code change, its own fix milestone)
- **(1, recommended) Engine builds against a stripped tsconfig.** Before the release build, the engine
  writes a build tsconfig (e.g. `tsconfig.deploy.json` extending the base, or a temp copy) whose `include`
  omits `.next/types`/`.next-isolated/types`; Next adds the release's own types; restore after. Surgical,
  keeps the `releases/<stamp>` layout, **preserves type-checking of the release's own types**. Verified.
- **(2, alternative) Depth-1 release dirs.** Make each release a depth-1 sibling of `.next` (like
  `.next-isolated`) so the symlink is depth-transparent. Also works (per the control), but changes the
  release layout/retention and scatters release dirs at the project root.
- **(3, rejected) `typescript.ignoreBuildErrors`.** Unnecessary — option 1 keeps full type-checking.

Do **not** change the committed tsconfig (dev + `build:isolated` need `.next/types`/`.next-isolated/types`).
The stripping is **build-time only, inside the engine.**

### Resolution — Option 1 IMPLEMENTED (branch `fix/d25a-de4-deploy-tsconfig`, PENDING REVIEW)
Uses Next's **officially-supported** `typescript.tsconfigPath` (config-schema `z.string().min(1).optional()`,
default `"tsconfig.json"`) — no tracked-file mutation:
- `next.config.mjs`: `typescript.tsconfigPath = process.env.NEXT_TSCONFIG_PATH || "tsconfig.json"` (mirrors the
  existing `NEXT_DIST_DIR` hook; defaults to the committed config for dev/normal builds).
- Engine `build()`: generates a gitignored `tsconfig.deploy.json` (`makeDeployTsconfig()` — extends
  `./tsconfig.json`, `include` omits `.next/types`+`.next-isolated/types`) and builds with
  `NEXT_TSCONFIG_PATH=tsconfig.deploy.json`. Next appends only `releases/<stamp>/types` to the **generated**
  file; committed `tsconfig.json` is never written.
- **End-to-end confirmed in staging:** with the `.next` symlink present (the case that failed), the build now
  **passes (exit 0)** and the committed `tsconfig.json` is untouched. Regression tests lock: deploy include
  omits the `.next*` type globs, still checks source, committed tsconfig keeps its globs, the `next.config`
  env hook, and the `.gitignore` entry.
- **Lifecycle hardening:** the generated file is written + **removed in a `finally` (success AND failure)**
  via `withDeployTsconfig(appDir, buildFn)`; deploys are **serialized by the PRECHECK lock** so the file
  can't collide. Tests assert cleanup on both paths, the lock's `EEXIST` serialization primitive, and
  PRECHECK-precedes-BUILD ordering. Gate: tsc 0; unit 70 files (deploy 39/39); e2e 43; build:isolated ok.

---
*Stop point: DE-4 root cause CORRECTED (symlink depth mismatch) and the fix CONFIRMED (build-time tsconfig
strip; verified in staging; type-checking preserved). This is an engine code change — awaiting your decision
(option 1 vs 2) to open it as its own fix milestone (isolated branch → fix → regression test → gate →
review → merge), then re-run the clean staging validation. Rehearsal remains blocked. Prod untouched
(pid 299921 / restart 96 / health 200); staging clean + healthy.*
