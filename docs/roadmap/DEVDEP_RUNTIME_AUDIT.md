# Follow-up audit — does the production path rely on devDependencies?

> Requested alongside [D19](./D19_AUTOMATION_RUNTIME_INVESTIGATION.md). D19 fixed the one place a
> **production-runtime** process depended on a devDependency (`tsx`). This audit checks whether anything
> *else* on the production path does. Scope: audit + document only — no code change. 2026-07-22.

## Method
Enumerated (a) every long-running production process and what it executes, (b) every binary/package the
D25 Deployment Engine invokes, and (c) whether each resolves under a clean `npm ci --omit=dev`
(reproduced in a throwaway clone: `/opt/crowdexpanse/d19-clean-verify`).

## Findings

### 1. Production RUNTIME processes — CLEAN under `--omit=dev` (after D19) ✅
| PM2 app | Executes | Runtime dep | In prod deps? |
|---|---|---|---|
| `crowdexpanse-commercial` | `node_modules/next/dist/bin/next start` | `next` | ✅ dependency |
| `crowdexpanse-automation` | `node --import tsx scripts/automation-runtime.mjs` | `tsx` | ✅ **now** a dependency (D19) |

`scripts/automation-runtime.mjs` imports **only** relative app modules + `node:` builtins + `@prisma/client`
— no bare devDependency package. Before D19 this was the sole prod-runtime devDep gap; it is now closed.

### 2. `prisma` CLI — present transitively as a PROD dep ✅ (not a gap)
`prisma` is listed in `devDependencies`, but `@prisma/client@5.22.0` **declares `prisma@5.22.0` as its own
dependency** — so `npm ls prisma --omit=dev` resolves it via the `@prisma/client` prod path. Confirmed the
Prisma client **generates** under a clean `--omit=dev` install. `prisma generate` / `migrate` are therefore
safe on a production-only install. (The engine itself never shells out to the prisma CLI — its
`latestMigration()` only *reads* the `prisma/migrations` directory as a schema-version proxy.)

### 3. BUILD phase needs devDependencies — BY DESIGN (operational invariant, not a defect) ⚠️
The engine's `BUILD` state runs `npm run build` → `next build` (`ops-real.mjs`), which legitimately needs
**`typescript`, `tailwindcss`, `postcss`, `eslint-config-next`** (all devDependencies). This is the standard
Next.js split: devDeps to *build*, prod deps to *run*. The engine **builds in place against the existing
`node_modules` and never runs its own `--omit=dev` install**, so this works because of an invariant:

> **Invariant: the deploy host's `node_modules` is a FULL install (dev + prod). Deployments build in place;
> they do not reinstall. Never run `npm ci --omit=dev` on the deploy host** — it would break `next build`
> (and, pre-D19, would also have silently re-broken the automation runtime).

If a future deployment topology builds off-host (CI) and ships a pruned `--omit=dev` runtime, that is fine
**for the runtime** (§1 confirms it resolves) — but the build must then happen where devDeps are present.

## Conclusion
D19 closed the **only** production-**runtime** devDependency reliance. The remaining devDep usage is the
**build step**, which is correct by design and guarded by the full-install invariant above. No further code
change recommended; the invariant is now documented (candidate: add a guard to the engine that refuses to
run if `node_modules` looks `--omit=dev`-pruned — a small future hardening, not required).
