# CRE Operating Workspace — UI Milestone 1 — PRODUCTION RELEASE RECORD

> **Status: RELEASED** — deployed to production and verified live 2026-07-30. First application of the
> mandatory **Accepted → Released** gate (a milestone is not finished until it is deployed, verified in
> production, and recorded). Governed decision: *Commercial Real Estate Operating Workspace — UI Milestone 1
> Production Release — APPROVED* (deploy now, no milestone tag). See `UI_MILESTONE_1_ACCEPTANCE.md` (the
> acceptance record that deliberately deferred deployment + tagging to this separate governance decision).

## What was released

- **Baseline:** `origin/main` `6f113f8` — "UI Milestone 1 — ACCEPTED WITH OBSERVATIONS (authoritative baseline)" (PR #53). Six accepted increments; read-only façade over the governed backend.
- **New surfaces now live (auth-gated):** Command Center, Seller Work Queue, Seller Record, Opportunity Workspace + Activity Timeline, Next-Best-Action, Missing-Information.
- **No schema / migration / API / authority changes** (diff of `prisma/` between the previously-deployed release and `6f113f8` was empty; acceptance record confirms none).

## Release sequence executed

1. Fast-forwarded local `main` (was 110 commits behind) to the accepted baseline `6f113f8`.
2. **Release Candidate** — D25 `--dry-run` (build + swap/rollback-target + single-active + disk/retention validation, no live change).
3. **Production deploy** — D25 atomic engine (`deploy.mjs --app-dir /opt/crowdexpanse/commercial --production --yes`): build → verify-build → atomic symlink SWAP → restart → verify-runtime → smoke. Auto-rollback armed; not triggered.
4. Live release: `releases/r1291219852119192-3274545`, build `ueIO9Ob8XrcMDcH_HAsFW`.

## Production verification (all PASS)

- `/api/health` → 200 (~20ms); pm2 `crowdexpanse-commercial` online.
- Auth gating: unauthenticated GET to `/command-center`, `/seller-queue`, `/opportunity-workspace` → **307 → /login** (not exposed).
- Authenticated (real ADMIN session, org with 6,937 sellers / 9,641 opportunities): Command Center 200; Seller Queue 200; Seller Record 200 (Next Best Action + Missing Information rendered); Opportunity Workspace 200 (Timeline + Next Best Action + Missing Information rendered).
- Regression: `/dashboard`, `/sellers`, `/opportunities`, `/api/health` all 200.
- Server error log: the current process (started 00:50:10Z) wrote **zero** errors since cutover. (Pre-existing `_error.js`/`dashboard/page.js` `MODULE_NOT_FOUND` lines in `error-3.log` date to a 2026-07-26 swap window; log mtime frozen at Jul 26 — not this release.)

## Deploy-engine defect surfaced + fixed by the RC gate — DE-6

The RC dry-run **failed at BUILD on its first run** — and this is exactly what the gate is for; the live server was never touched (`ROLLBACK skipped — no swap occurred`).

- **Symptom:** `next build` type error — `scripts/diag/be3-corpus-rerun.ts`: "An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled."
- **Root cause:** the DE-4 generated `tsconfig.deploy.json` (`makeDeployTsconfig`, `scripts/deploy/ops-real.mjs`) `extends` the base tsconfig but **replaces** `exclude`. When PR #50 added `scripts` to the base tsconfig's `exclude` (tsx-run diag CLIs, type-checked separately via `tsconfig.scripts.json`), the deploy config was not updated — so the deploy build type-checked the diag CLIs and failed on their `.ts`-extension imports. Sibling of DE-5. **No D25 deploy could have succeeded since PR #50 merged.**
- **Fix (behavior-neutral, app-source untouched):** add `"scripts"` to the deploy tsconfig's `exclude`, restoring parity with the base tsconfig. RC dry-run then passed end-to-end; production deploy succeeded.
- **Landing:** the fix is on branch `chore/de-6-deploy-tsconfig-scripts-exclude` (this record is on the same branch) — **pending a governed PR + merge** (per the no-direct-to-main post-launch model; precedent PR #49 / PR #50). Until merged, a fresh checkout's next D25 deploy would reproduce the failure.

## Decision & standing

- **UI Milestone 1 = RELEASED.** Accepted + frozen + now deployed + verified live.
- **No milestone tag** (per founder; consistent with the acceptance record's current no-tag state). The release record + release stamp `r1291219852119192-3274545` + baseline `6f113f8` are the durable reference.
- Next: Milestone 2 planning proceeds from this released baseline under a new governed initiative — after DE-6 lands.
