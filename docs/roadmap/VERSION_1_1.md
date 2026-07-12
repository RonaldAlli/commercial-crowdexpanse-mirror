# Version 1.1 — Operational Excellence

> **Theme:** Make the existing workflow trustworthy before adding surface area.
> **Status:** 🟡 In progress (~82%). Testing/CI, Better Lists, and permissions Slice 1 (high-risk ops) done; permissions Slice 2 (create/update), team/invite lifecycle, and performance remain.

## Goal
Everything the team already does daily should be fast, safe, tested, and permission-aware. No new domain surface — depth over breadth.

## Scope

### 1. Remaining Better Lists — 🟢 mostly done
Search + sort + pagination shipped for **all five core lists** (Sellers, Buyers, Properties, Opportunities-List, Tasks) on the shared `lib/list-params.ts`.
- **Remaining:** relation search (seller-name on properties; property/seller/owner on opportunities & tasks); optional extra sorts (e.g. asking-price); saved views / column controls; board-view filtering for Opportunities.
- See [Better Lists module roadmap](./MODULE_ROADMAPS.md#better-lists).

### 2. Permissions — 🟡 partial (Slice 1 done)
Role model exists (`ADMIN`/`ACQUISITIONS`/`ANALYST`/`DISPOSITIONS`) with last-admin protection.
- **Slice 1 (done):** documented **permission matrix** as a single source of truth (`lib/permissions.ts`), enforced server-side for **high-risk operations** — deletes (all record types), pipeline stage movement (segment-based on current **and** target stage), and team/invitation management — with an `authorization.denied` audit trail and a generic user-facing message. Unauthorized UI controls are hidden; the server is always authoritative. Covered by `e2e-permissions.mjs`.
- **Remaining (Slice 2):** enforce ordinary create/update in server actions and hide their entry points; complete Team Management (member lifecycle) and Invitations (email delivery, resend/expiry UX).
- See [Permissions](./MODULE_ROADMAPS.md#permissions), [Team Management](./MODULE_ROADMAPS.md#team-management), and [Invitations](./MODULE_ROADMAPS.md#invitations).

### 3. Testing — 🟢 done (foundation)
Slices 1–3 complete: `npm test` runs 10 E2E scripts against a dedicated `_test` DB behind a no-override guard; sweeper + reset tooling.
- **Remaining (tracked in Testing Roadmap):** unit tests for pure logic (`lib/analysis.ts`, `lib/matching.ts`, `lib/list-params.ts`, `lib/task-sort.ts`); a regression checklist.

### 4. CI — 🟢 done
GitHub Actions on the mirror with ephemeral Postgres runs `test:ci` + build on push-to-`main`/PR.
- **Remaining:** decide on Gitea Actions (runner unconfirmed); add lint to CI; build artifact/size guard.

### 5. Performance
- Add DB indexes for the new list search/sort paths as data grows; verify org-scoped queries use `@@index([organizationId])`.
- Measure p95 for the heaviest pages (Opportunities board, Global Search); set budgets.
- Introduce Prisma query timing in dev; eliminate N+1 in list includes.

## Release Checklist (1.1)
- [~] Permission matrix documented and enforced in server actions. (Slice 1: high-risk ops done; Slice 2: create/update pending.)
- [ ] Team Management Slice 2 + Invitations delivery shipped.
- [ ] Relation search decision made (ship or explicitly defer to 1.2).
- [ ] Unit tests for the four pure `lib/*` modules.
- [ ] Lint added to CI; CI green on `main`.
- [ ] Performance budgets set for board + search; indexes reviewed.
- [ ] Dashboard + Module Roadmaps updated; Tech Debt reviewed.

## Definition of Done (1.1)
Global DoD ([EMP](./ENGINEERING_MASTER_PLAN.md#definition-of-done)) **plus**: every list is permission-aware, every pure module has unit coverage, and no critical path exceeds its latency budget.

## Out of scope (defer)
Market/owner/property intelligence (1.2), full financial modeling (1.3), closing workflow (1.4), any AI (2.0).
