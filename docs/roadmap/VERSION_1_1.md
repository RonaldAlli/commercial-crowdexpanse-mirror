# Version 1.1 — Operational Excellence

> **Theme:** Make the existing workflow trustworthy before adding surface area.
> **Status:** 🟡 In progress (~94%). Testing/CI, Better Lists, permissions (Slices 1 + 2), member lifecycle, invitation resend, organization settings (3c — shipped & deployed), and email **infrastructure** (3d-i — MessageService + `EmailMessage` outbox, no feature wired) done; invitation delivery (3d-ii), performance, unit-test depth, and lint-in-CI remain. Password reset is split out as Slice 3e.

## Goal
Everything the team already does daily should be fast, safe, tested, and permission-aware. No new domain surface — depth over breadth.

## Scope

### 1. Remaining Better Lists — 🟢 mostly done
Search + sort + pagination shipped for **all five core lists** (Sellers, Buyers, Properties, Opportunities-List, Tasks) on the shared `lib/list-params.ts`.
- **Remaining:** relation search (seller-name on properties; property/seller/owner on opportunities & tasks); optional extra sorts (e.g. asking-price); saved views / column controls; board-view filtering for Opportunities.
- See [Better Lists module roadmap](./MODULE_ROADMAPS.md#better-lists).

### 2. Permissions — 🟢 done (Slices 1 + 2)
Role model (`ADMIN`/`ACQUISITIONS`/`ANALYST`/`DISPOSITIONS`) with last-admin protection, now fully enforced.
- **Slice 1:** documented **permission matrix** as a single source of truth (`lib/permissions.ts`), enforced server-side for high-risk operations — deletes, pipeline stage movement (segment-based on current **and** target stage), team/invitation management — with an `authorization.denied` audit trail and a generic user-facing message.
- **Slice 2:** ordinary create/update enforced across every write action; opportunity-edit stage changes rejected in full when disallowed (the one field-level rule — no `canEditField`); create/edit UI hidden and `/new` + `/[id]/edit` routes guarded (`can()` + `notFound()`, no audit on page loads); ADMIN-only **Access denials** report at `/settings/security`. The five [Authorization Principles](./ENGINEERING_MASTER_PLAN.md#authorization-principles) are documented in the EMP.
- **Remaining for 1.1 (separate modules):** Team Management **member lifecycle** (Slice 3a — deactivation + immediate session invalidation, on a new Prisma Migrate baseline), **invitation resend/lifecycle** (Slice 3b — token rotation in place), and **organization settings** (Slice 3c — configurable invite expiry + default role + org rename, dedicated `OrganizationSettings` model) are shipped. Email **infrastructure** (Slice 3d-i — `MessageService`/`EmailMessage` outbox) is merged as a reusable platform seam; **invitation delivery** (Slice 3d-ii) wires it into `createInvite`/`resendInvite` next. Password reset is **Slice 3e**.
- See [Permissions](./MODULE_ROADMAPS.md#permissions), [Team Management](./MODULE_ROADMAPS.md#team-management), [Invitations](./MODULE_ROADMAPS.md#invitations), and [Communications](./MODULE_ROADMAPS.md#communications).

### 3. Testing — 🟢 done (foundation)
Slices 1–3 complete: `npm test` runs 14 E2E scripts against a dedicated `_test` DB behind a no-override guard; sweeper + reset tooling.
- **Remaining (tracked in Testing Roadmap):** unit tests for pure logic (`lib/analysis.ts`, `lib/matching.ts`, `lib/list-params.ts`, `lib/task-sort.ts`); a regression checklist.

### 4. CI — 🟢 done
GitHub Actions on the mirror with ephemeral Postgres runs `test:ci` + build on push-to-`main`/PR.
- **Remaining:** decide on Gitea Actions (runner unconfirmed); add lint to CI; build artifact/size guard.

### 5. Performance
- Add DB indexes for the new list search/sort paths as data grows; verify org-scoped queries use `@@index([organizationId])`.
- Measure p95 for the heaviest pages (Opportunities board, Global Search); set budgets.
- Introduce Prisma query timing in dev; eliminate N+1 in list includes.

## Release Checklist (1.1)
- [x] Permission matrix documented and enforced in server actions. (Slices 1 + 2 complete; enforcement + audit across all write actions.)
- [~] Team Management member lifecycle (3a), invitation resend (3b), organization settings (3c), and email infrastructure (3d-i) shipped; invitation delivery (3d-ii) still pending. (Password reset split to 3e.)
- [ ] Relation search decision made (ship or explicitly defer to 1.2).
- [ ] Unit tests for the four pure `lib/*` modules.
- [ ] Lint added to CI; CI green on `main`.
- [ ] Performance budgets set for board + search; indexes reviewed.
- [ ] Dashboard + Module Roadmaps updated; Tech Debt reviewed.

## Definition of Done (1.1)
Global DoD ([EMP](./ENGINEERING_MASTER_PLAN.md#definition-of-done)) **plus**: every list is permission-aware, every pure module has unit coverage, and no critical path exceeds its latency budget.

## Out of scope (defer)
Market/owner/property intelligence (1.2), full financial modeling (1.3), closing workflow (1.4), any AI (2.0).
