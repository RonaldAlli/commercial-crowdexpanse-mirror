# Opportunity Workspace Discoverability Remediation — Increment 1 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-31). Accepts Increment 1 "core deal-opening
> repoints" (PR #83, merged to `main` `44126fb`). Read-only navigation repointing via existing links; no schema /
> API / workflow / Closing Console changes. **No deployment; the remediation is not released.** Context:
> `UI_OPPORTUNITY_WORKSPACE_DISCOVERABILITY_REMEDIATION_PLAN.md`,
> `UI_OPPORTUNITY_WORKSPACE_DISCOVERABILITY_REMEDIATION_PLAN_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## Accepted (recorded)

1. **Operator Entry Principle implemented** — the first concrete application; operator-oriented surfaces now land
   on the Opportunity Workspace.
2. **Primary deal-opening surfaces repointed** (7): Pipeline board + table (`opportunities/page.tsx:305,370`),
   Dashboard "Recent opportunities" (`dashboard/page.tsx:174`), global search (`lib/search.ts:115`), Tasks list
   (`tasks/page.tsx:148`), Task detail (`tasks/[id]/page.tsx:39`), related-record note links (`lib/note-links.ts:24`)
   → `/opportunity-workspace/[id]`.
3. **Execution intent preserved** — Closing Dashboard, `#closing-center` links, and the Closing Workspace →
   Closing Console handoff remain directed to the Console.
4. **Closing Dashboard (C3) intentionally unchanged.**
5. **No schema authority changed. No API authority changed. No workflow authority changed. No Closing Console
   modification.**
6. **Test coverage** — added `workspacePath` helper; updated `opportunity-list-badges` + `opportunity-board-stage`
   locators and the `note-links` unit assertion; added `cre-discoverability-inc1.spec.ts` (6 repoint checks + a
   guard that the Closing Dashboard still opens the Console). Verification all green: isolated build EXIT 0,
   app `tsc` 0, scripts `tsc` 0, ESLint clean, unit 130, **Playwright 116/116** (OB-1 teardown non-blocking).

## Production incident (recovered before review — does not block acceptance)

During verification a bare `next build` was run in the app dir whose `.next` is a live-release symlink, writing
build output into the live release and dropping its `BUILD_ID`. It was detected, the feature work was preserved on
its branch, and **production was restored to the accepted baseline before this review** via the D25 engine (clean
release `r1410644903405812-409890`, build `0-MLbCtDXJb1Y224cH9qo`, baseline `aa52255` = `eb6baf2` app code + docs;
corrupted release deleted). The feature branch remained undeployed. Operational lesson recorded in
[[crowdexpanse-host-access]].

## Carry-forward — Production Build Isolation (operational contract)

**Verification builds must never write into production runtime artifacts.** Validation must always target an
isolated build directory (`npm run build:isolated` / `NEXT_DIST_DIR=.next-isolated`) or the deployment engine, so
that validation and deployment remain completely independent. **Never run a standard `next build` against an
application whose `.next` is a live production symlink.** Belongs in the deployment documentation and operational
guidance; complements [[crowdexpanse-accepted-to-released-discipline]].

## Next governed phase

**Increment 2 — APPROVED TO IMPLEMENT** (founder 2026-07-31): C1 Buyer Matches, C2 Analyzer back-links (×2), C4
post-create redirect → Opportunity Workspace. **C3 Closing Dashboard NOT modified.** Continue isolated verification
builds. Stop after Increment 2 for review. Increment 3 (Workspace → "Open Closing Console" affordance) and the
Accepted → Released lifecycle follow, each on its own authorization.
