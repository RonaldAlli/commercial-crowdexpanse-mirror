# Version 1.1 — Operational Excellence

> **Theme:** Make the existing workflow trustworthy before adding surface area.
> **Status:** 🟡 In progress (~97%). Testing/CI, Better Lists, permissions (Slices 1 + 2), member lifecycle, invitation resend, organization settings (3c), email **infrastructure** (3d-i), **invitation email delivery** (3d-ii), the **unit-test foundation** (PQ-1), and **lint-in-CI** (PQ-2 — blocking gate, baseline clean) done; **performance (PQ-3/PQ-4)** is the main remaining work. Password reset (3e) is an optional 1.1/1.2 follow-on on the same platform.

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
- **Remaining for 1.1 (separate modules):** Team Management **member lifecycle** (Slice 3a — deactivation + immediate session invalidation, on a new Prisma Migrate baseline), **invitation resend/lifecycle** (Slice 3b — token rotation in place), and **organization settings** (Slice 3c — configurable invite expiry + default role + org rename, dedicated `OrganizationSettings` model) are shipped. Email **infrastructure** (Slice 3d-i — `MessageService`/`EmailMessage` outbox) is a reusable platform seam, and **invitation delivery** (Slice 3d-ii) wires it into `createInvite`/`resendInvite` (emailed accept link, copy-link fallback, `inline-only` retry). Password reset is **Slice 3e**.
- See [Permissions](./MODULE_ROADMAPS.md#permissions), [Team Management](./MODULE_ROADMAPS.md#team-management), [Invitations](./MODULE_ROADMAPS.md#invitations), and [Communications](./MODULE_ROADMAPS.md#communications).

### 3. Testing — 🟢 done (foundation + unit layer)
Slices 1–3 complete: `npm test` runs 15 E2E scripts against a dedicated `_test` DB behind a no-override guard; sweeper + reset tooling. **PQ-1** adds a `node:test`+`tsx` **unit layer** under `tests/unit/**` with a branch-coverage gate (≥90% critical / ≥80% overall), wired into `test:ci` + CI.
- **Remaining (tracked in Testing Roadmap):** a written regression checklist; broader pure-helper coverage as modules grow.

### 4. CI — 🟢 done
GitHub Actions on the mirror with ephemeral Postgres runs distinct blocking steps — **Typecheck → Lint → Unit → E2E → Build** — on push-to-`main`/PR (lint added in PQ-2).
- **Remaining:** decide on Gitea Actions (runner unconfirmed); build artifact/size guard.

### 5. Performance
- Add DB indexes for the new list search/sort paths as data grows; verify org-scoped queries use `@@index([organizationId])`.
- Measure p95 for the heaviest pages (Opportunities board, Global Search); set budgets.
- Introduce Prisma query timing in dev; eliminate N+1 in list includes.

## Release Checklist (1.1)
- [x] Permission matrix documented and enforced in server actions. (Slices 1 + 2 complete; enforcement + audit across all write actions.)
- [x] Team Management member lifecycle (3a), invitation resend (3b), organization settings (3c), email infrastructure (3d-i), and invitation email delivery (3d-ii) shipped. (Password reset split to 3e.)
- [ ] Relation search decision made (ship or explicitly defer to 1.2).
- [x] Unit tests for the pure `lib/*` modules (PQ-1 — branch-gated, in `test:ci` + CI).
- [x] Lint added to CI as a blocking step; baseline already clean, `next lint` green on `main` (PQ-2).
- [ ] Performance budgets set for board + search; indexes reviewed.
- [ ] Dashboard + Module Roadmaps updated; Tech Debt reviewed.

## Definition of Done (1.1)
Global DoD ([EMP](./ENGINEERING_MASTER_PLAN.md#definition-of-done)) **plus**: every list is permission-aware, every pure module has unit coverage, and no critical path exceeds its latency budget.

## Out of scope (defer)
Market/owner/property intelligence (1.2), full financial modeling (1.3), closing workflow (1.4), any AI (2.0).
