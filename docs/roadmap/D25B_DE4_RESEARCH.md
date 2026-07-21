# D25b · DE-4 Research — custom `distDir` × Next's tsconfig type-includes

> **Investigation milestone (no build-safety changes). Conclusion: NOT a Next.js incompatibility and NOT a
> case for `ignoreBuildErrors`. Custom `distDir` is fully supported; the failure was contamination
> (a migrated build) surfacing an `include`-accumulation interaction. The permanent fix is the
> fresh-build invariant, not disabling type-checking.** 2026-07-21.

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
*Stop point: DE-4 understood + documented; fresh-build invariant codified; staging clean. Awaiting your
decision on the permanent solution (A alone, or A + optional B) and authorization to resume the clean
staging validation.*
