# Version 1.1 — Operational Excellence

> **Theme:** Make the existing workflow trustworthy before adding surface area.
> **Status:** ✅ **Released — `v1.1.0` (2026-07-14), frozen on `release/1.1`.** Testing/CI, Better Lists, permissions (Slices 1 + 2), member lifecycle, invitation resend, organization settings (3c), email 3d-i/3d-ii, unit-test foundation (PQ-1), lint-in-CI (PQ-2), performance instrumentation + baseline (PQ-3), and performance optimization (PQ-4 — board payload narrowing, board p95 ~109 → ~43 ms) all shipped; every measured path is within budget. **Password reset (3e) was moved to [Version 1.2](./VERSION_1_2.md)** — it is not required for Operational Excellence and does not unblock 1.2. **Relation search** was explicitly deferred to 1.2 (Better Lists enrichment).

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
- **Remaining for 1.1 (separate modules):** Team Management **member lifecycle** (Slice 3a — deactivation + immediate session invalidation, on a new Prisma Migrate baseline), **invitation resend/lifecycle** (Slice 3b — token rotation in place), and **organization settings** (Slice 3c — configurable invite expiry + default role + org rename, dedicated `OrganizationSettings` model) are shipped. Email **infrastructure** (Slice 3d-i — `MessageService`/`EmailMessage` outbox) is a reusable platform seam, and **invitation delivery** (Slice 3d-ii) wires it into `createInvite`/`resendInvite` (emailed accept link, copy-link fallback, `inline-only` retry). **Password reset (Slice 3e) was moved to [Version 1.2](./VERSION_1_2.md)** — it reuses this same email platform but is not required for 1.1's Operational Excellence theme.
- See [Permissions](./MODULE_ROADMAPS.md#permissions), [Team Management](./MODULE_ROADMAPS.md#team-management), [Invitations](./MODULE_ROADMAPS.md#invitations), and [Communications](./MODULE_ROADMAPS.md#communications).

### 3. Testing — 🟢 done (foundation + unit layer)
Slices 1–3 complete: `npm test` runs 15 E2E scripts against a dedicated `_test` DB behind a no-override guard; sweeper + reset tooling. **PQ-1** adds a `node:test`+`tsx` **unit layer** under `tests/unit/**` with a branch-coverage gate (≥90% critical / ≥80% overall), wired into `test:ci` + CI.
- **Remaining (tracked in Testing Roadmap):** a written regression checklist; broader pure-helper coverage as modules grow.

### 4. CI — 🟢 done
GitHub Actions on the mirror with ephemeral Postgres runs distinct blocking steps — **Typecheck → Lint → Unit → E2E → Build** — on push-to-`main`/PR (lint added in PQ-2).
- **Remaining:** decide on Gitea Actions (runner unconfirmed); build artifact/size guard.

### 5. Performance — 🟢 done (PQ-3 baseline + PQ-4 optimization)
- **PQ-3 (done — instrumentation, observational only):** `lib/telemetry.ts` (zero-dep timing), `/api/health` DB-latency probe, and a seeded `_test` measurement harness (`npm run perf:measure`). **Baseline recorded** — board p95 ~110 ms, search ~12 ms, lists ≤ 8 ms at 1k opps / 2k props / 5k tasks; all within the proposed budgets. See [Performance Baseline](./PERFORMANCE.md).
- **PQ-4 (done — optimization, evidence-driven):** **PQ-4a** narrowed the Opportunities-board query to a dedicated `select` (six card columns + property `{name, assetType}`; seller relation dropped) — `EXPLAIN`-verified (row width 197 → 97 B, seller query eliminated), **board p95 ~109 → ~43 ms (≈57%)**, no schema/index/cache/pagination change and no regression elsewhere. A standardized `EXPLAIN` helper (`npm run perf:explain`) was added. With every path then well within budget, **PQ-4 is complete** — pagination/virtualization/indexes/caching are recorded as future scalability options, revisited only if a future baseline breaches a budget. See the [optimization records](./PERFORMANCE.md#pq-4-optimization-records-evidence-driven).

## Release Checklist (1.1)
- [x] Permission matrix documented and enforced in server actions. (Slices 1 + 2 complete; enforcement + audit across all write actions.)
- [x] Team Management member lifecycle (3a), invitation resend (3b), organization settings (3c), email infrastructure (3d-i), and invitation email delivery (3d-ii) shipped. (Password reset 3e moved to 1.2.)
- [x] Relation search decision made — **explicitly deferred to 1.2** (Better Lists enrichment).
- [x] Unit tests for the pure `lib/*` modules (PQ-1 — branch-gated, in `test:ci` + CI).
- [x] Lint added to CI as a blocking step; baseline already clean, `next lint` green on `main` (PQ-2).
- [x] Performance budgets set for board + search; board optimized (PQ-4a, ~57% p95) and `EXPLAIN`-reviewed — no indexes needed at current scale (PQ-3 baseline + PQ-4).
- [x] Dashboard + Module Roadmaps + Tech Debt reviewed and synced at release.

## Definition of Done (1.1)
Global DoD ([EMP](./ENGINEERING_MASTER_PLAN.md#definition-of-done)) **plus**: every list is permission-aware, every pure module has unit coverage, and no critical path exceeds its latency budget.

## Out of scope (defer)
Password reset (Slice 3e → 1.2), relation search (→ 1.2), market/owner/property intelligence (1.2), full financial modeling (1.3), closing workflow (1.4), any AI (2.0).
