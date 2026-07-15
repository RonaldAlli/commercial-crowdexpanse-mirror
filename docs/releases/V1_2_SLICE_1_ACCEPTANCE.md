# Version 1.2 · Slice 1 — Production Acceptance Record

> **Purpose:** the formal production sign-off for **Version 1.2, Slice 1 — Intelligence Spine + Owner foundation**. It answers *"what constitutes a successful production release?"* — distinct from the [Slice 1 Retrospective](../roadmap/SLICE_1_RETROSPECTIVE.md)'s *"what did we learn?"*
> **Status:** ✅ **ACCEPTED — live in production.**
> **Acceptance date:** 2026-07-15.
> **Accepted build ID:** `9555QJiLxh4O9PrlVp3UH` (superseding the stale `6ML_4ydZlmwjCD0tgAiCe`).
> **Accepted commit:** the commit this record lands in on `main` (tagged — see [§10](#10-release-tag)). Slice 1 code was complete at commit **1d-3b** (`270fbab` implementation · `dbeeb60` docs).

---

## 1. Acceptance criteria & result

| # | Criterion | Result |
|---|---|---|
| 1 | Architecture approved | ✅ [§2](#2-architecture-approval) |
| 2 | Code merged to `main`, both remotes | ✅ [§3](#3-merged-commit-state) |
| 3 | Typecheck · unit (coverage gate) · E2E all green | ✅ [§4](#4-test--build-results) |
| 4 | Production build succeeds; no schema drift | ✅ [§4](#4-test--build-results) |
| 5 | Production DB migrations current (**10**) | ✅ [§5](#5-production-database) |
| 6 | Frontend deployed & serving the new build | ✅ [§6](#6-frontend-deployment--live-verification) |
| 7 | ADMIN surfaces function | ✅ [§7](#7-admin-acceptance) |
| 8 | Non-ADMIN authorization enforced server-side | ✅ [§8](#8-non-admin-authorization) |
| 9 | Tech-Debt D5 resolved | ✅ [§9](#9-d5-resolution) |
| 10 | Release tagged | ⏳ [§10](#10-release-tag) (proposed; awaiting name confirmation) |

**Final decision: [§11](#11-final-acceptance-decision).**

---

## 2. Architecture approval

The governing design is **[Volume 12 — Commercial Intelligence Architecture](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)**, with architecture locked 2026-07-14 ([locked decisions A–F + identity strategy](../roadmap/VERSION_1_2.md#locked-architecture-decisions-2026-07-14)). Slice 1 delivered the shared spine every later layer reuses: first-class `Owner` (distinct from `Seller`), the `Observation → Signal → Projection` provenance pipeline, deterministic canonical identity with reversible merge, a pure `SourceAdapter` ingestion path, and a thin consuming UI — all additive, org-scoped, permission-gated, deterministic (no AI). The five-domain separation (Identity ≠ Provenance/Projection ≠ Ingestion ≠ Linking ≠ Candidate Review ≠ Merge) and its named invariants are recorded in Volume 12 §13 and the [Retrospective](../roadmap/SLICE_1_RETROSPECTIVE.md).

## 3. Merged commit state

- Branch: `main`, synchronized to both remotes (`gitea` = origin, `github` mirror).
- Slice 1 commit sequence: **1a → 1a-2 → 1b-1 → 1b-2 → 1c → 1d-1 → 1d-2a → 1d-2b → 1d-3a → 1d-3b** (final code `270fbab`, "Add owner merge/unmerge controls").
- Migrations taken only when schema changed (6 of 10 commits were migration-free) — see the [Retrospective timeline](../roadmap/SLICE_1_RETROSPECTIVE.md#3-timeline-of-commits-1a--1d-3b).

## 4. Test & build results

Full CI suite run on the isolated `_test` database (`commercial_crowdexpanse_test`; the E2E guard refuses any non-`*_test` target — production can never be a test target):

- **Typecheck** (`tsc --noEmit`): ✅ pass (0 errors).
- **Unit** (`node:test` + `tsx`, branch-coverage gate): ✅ pass. **All CRITICAL modules ≥ 90% branch**, including the Slice 1 logic:
  - `lib/permissions.ts` 92.6% · `lib/intelligence/owner-identity.ts` 95.5% · `lib/intelligence/projection-precedence.ts` 90.9% · `lib/intelligence/owner-duplicates.ts` 93.3% · `lib/intelligence/owner-merge-suggest.ts` 92.9% (plus `analysis`/`matching`/`list-params`/`task-sort`).
- **E2E** (`npm test`): ✅ **all 25 scripts passed**, including the Slice 1 surfaces: `e2e-owner-identity`, `e2e-owner-linking`, `e2e-owner-candidates`, `e2e-owner-merge`, `e2e-owner-merge-flow`, `e2e-owner-ui`, `e2e-projection`, `e2e-provenance`, `e2e-refresh`, `e2e-refresh-ui`, `e2e-permissions`. These prove, among others, the reversibility golden invariant (snapshot → merge → unmerge → identical graph), the projection reconstruction invariant, forced-rollback atomicity of merge+decision-resolution in both directions, and that linking writes no Observation/Signal.
- **Production build**: ✅ succeeds under the deploy user; the served build ID changed on redeploy (§6). **No schema drift** — `prisma migrate status` reports the DB up to date at 10 migrations with no pending/divergent migrations.

## 5. Production database

`prisma migrate status` against production (`commercial_crowdexpanse`): **10 migrations found, "Database schema is up to date!"** Slice 1's schema-bearing commits (1a, 1a-2, 1b-1, 1c, 1d-2b, 1d-3b) are all deployed; the final additive migration `20260714232459_add_match_decision_resolution` (1d-3b, prod 9→10) is applied. All Slice 1 migrations are additive and backward-compatible.

## 6. Frontend deployment & live verification

The stale-frontend blocker (D5) is resolved and the new build is confirmed serving, locally and externally:

| Check | Result |
|---|---|
| `.next/BUILD_ID` on host | `9555QJiLxh4O9PrlVp3UH` |
| Served build (local, app port) | `9555QJiLxh4O9PrlVp3UH` |
| Served build (external, `https://commercial.crowdexpanse.com/login`) | `9555QJiLxh4O9PrlVp3UH` |
| Prior stale build | `6ML_4ydZlmwjCD0tgAiCe` (no longer served) |
| App health (`/api/health`) | `{"status":"ok", ...}` |
| Process manager | app process **online** |
| `.next` ownership | 0 files owned by another user (previously ~420 root-owned) |

The live build ID matching disk **and** the external site is the decisive proof that nginx, the process manager, and the production `.next` are aligned on the current build.

## 7. ADMIN acceptance

> **Method note (read this).** Interactive human click-through of the live authenticated UI as a real ADMIN was **not** performed from the deployment environment (no browser / no production credentials there). Per the closure authorization, live-UI acceptance was substituted by: (a) the full **E2E suite** exercising these surfaces end-to-end against the schema-identical `_test` DB, (b) a **server-side code audit** of every route/action guard, and (c) **read-only production probes**. A final optional human smoke-click by an ADMIN is recommended but not blocking — see [§12](#12-remaining-operational-caveats).

ADMIN-reachable Slice 1 surfaces, all verified present in the served build and covered by green E2E:

- **Owners list** `/owners` (name search, sort, pagination, hide-merged default, empty states) and **Owner detail** (per-field provenance: Projected Value → Winning Signal → Signal History) — `e2e-owner-ui`.
- **Create / edit** owner with create-time duplicate warning, override pins, clear-override — `e2e-owner-ui`, `e2e-projection`.
- **Seller↔Owner / Property↔Owner linking**, atomic move (A→B), unlink — `e2e-owner-linking` (proves link writes no Observation/Signal).
- **Candidate review** `/owners/candidates` — confirm / dismiss / ADMIN reopen — `e2e-owner-candidates`.
- **Manual refresh** trigger + inline `RefreshJob` history on Owner detail — `e2e-refresh`, `e2e-refresh-ui`.
- **Merge workspace** `/owners/merges` + `/owners/merges/[id]` — deterministic advisory winner (never auto-applied), atomic merge+resolution / unmerge+unresolution — `e2e-owner-merge`, `e2e-owner-merge-flow`.

Read-only production probe: unauthenticated requests to protected surfaces (e.g. `/owners`) return `307 → /login`, confirming the middleware/session gate is live in the served build. **No destructive test merge was performed against real production records** (per closure directive; the reversibility/atomicity guarantees are proven by E2E on the test DB).

## 8. Non-ADMIN authorization

Server-side role enforcement, confirmed by code audit (`lib/permissions.ts`, `lib/authorize.ts`, and each route/action) and by `e2e-permissions` / `e2e-team-roles`. Roles: **ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS**.

| Surface / action | Required | Enforced at |
|---|---|---|
| Owner read (list, detail) | all 4 roles | policy (`OWNER` read) |
| Owner create/update/link/unlink/move/clear-override | ADMIN, ACQUISITIONS | server action `checkAuthorized(…, "OWNER")` + link page `notFound()` |
| Candidate review (view + confirm/dismiss) | ADMIN, ACQUISITIONS | page `notFound()` (`OWNER_IDENTITY` has no read tier) + action `checkAuthorized(…, "MANAGE", "OWNER_IDENTITY")` |
| Candidate **reopen** | **ADMIN only** | action `canReopenMatchDecision` |
| Refresh trigger | ADMIN, ACQUISITIONS | action `checkAuthorized(…, "MANAGE", "REFRESH")` |
| Refresh history (read) | all 4 roles | page read flag (`REFRESH` read) |
| **Merge workspace pages** | **ADMIN only** | server component `notFound()` on both pages |
| **Execute merge / unmerge** | **ADMIN only** | action `canMergeOwners` throws before touching data — **independent of the page/button** |

**Defense in depth confirmed:** merge/unmerge are gated at *both* the page layer (`notFound()`) and the action layer (throws before any data access). A non-ADMIN cannot reach the pages, and even a forged direct action call is denied server-side. **No Slice 1 mutation is protected by UI-hiding alone** — every write/identity/merge/refresh action re-checks authorization on the server. The `can(...)` calls in page components are display flags only, backed by independent server guards.

## 9. D5 resolution

**Root cause:** an external build run as **root** on 2026-07-09 left ~420 nested files in `/opt/crowdexpanse/commercial/.next` owned by `root:root`. Because the top-level `.next` dir looked `deploy`-owned, the problem was easy to miss; but `next build`'s clean phase could not unlink the root-owned `.next/server/*`, `.next/static/*`, `.next/types/*` files (deploy user, no non-interactive sudo), so the build kept serving the pre-1.2 bundle while a newer `.next-isolated` build sat unused beside it. The entire 1.2 Owner UI was merged, built, and prod-DB-current but **not user-accessible**.

**Permanent fix applied (2026-07-15):** stop the app process → `chown -R deploy:deploy .next` → rebuild as `deploy` → restart. Verified by the build-ID flip on disk, locally, and externally (§6), with 0 remaining foreign-owned files in `.next`.

**Recurrence guard (permanent):** `scripts/predeploy-check.mjs`, wired as the npm `prebuild` / `prebuild:isolated` hook, now fails the build *before* Next runs if — outside CI — it is invoked as root, if the target dist dir contains any file owned by another user, or if the dist dir is not writable. There is no bypass flag. **Production builds must never be run with `sudo`** (that is the exact action that created D5); the guard enforces this and prints the correct `chown` remediation.

## 10. Release tag

No slice-level tag convention exists yet (prior tags are full releases: `v1.0.0`, `v1.1.0`; Slice 1 is a partial delivery within in-progress 1.2). **Proposed:** annotated tag **`v1.2.0-slice.1`** (semver pre-release extending the `vX.Y.Z` convention) on the accepted commit, pushed to both remotes. Awaiting confirmation of the name before the tag is pushed.

## 11. Final acceptance decision

**✅ ACCEPTED — Version 1.2 Slice 1 is live in production and formally closed.** All release-gating criteria are met: architecture approved; code merged to both remotes; typecheck/unit/E2E green with CRITICAL coverage ≥ 90%; production DB current at 10 migrations with no drift; the new frontend build `9555QJiLxh4O9PrlVp3UH` is confirmed serving locally and externally; ADMIN surfaces function; non-ADMIN authorization is enforced server-side with defense in depth; and D5 is resolved with a permanent recurrence guard. The only open items are the non-blocking operational caveats below and confirmation of the release-tag name.

## 12. Remaining operational caveats (non-blocking)

- **Off-site backup / R2 (Tech-Debt D4):** the six-stage encrypted backup tooling is complete and restore-verified, but the **off-site mirror is not yet active** — the Cloudflare R2 bucket/credentials are unprovisioned and the backup cron is not installed, so runs report 5/6 (off-site stage skipped) and no schedule is enforced. Production currently has **no guaranteed off-host DR copy**. Operational, tracked in [Operations](../roadmap/OPERATIONS_ROADMAP.md#backups--implemented-d4-scheduling--r2-creds-pending) / [D4](../roadmap/TECHNICAL_DEBT.md).
- **Denied privileged actions not fully audited:** denied `merge` / `unmerge` / candidate-`reopen` attempts throw via the raw `canMergeOwners` / `canReopenMatchDecision` predicates and **bypass the `authorization.denied` audit log** (other denials are audited via `checkAuthorized`/`authorize`). Enforcement is correct; only the audit record is missing. Tracked as **Tech-Debt D12**.
- **Optional human UI smoke:** an interactive ADMIN + non-ADMIN click-through of the live site remains a recommended (non-blocking) final confirmation; acceptance here rests on E2E + server-side code audit + read-only production probes (§7).
- **No staging environment:** release verification is local + CI + read-only production probes; in-place host builds still risk brief disruption (Infrastructure debt).

---

*Companion records: [Slice 1 Retrospective](../roadmap/SLICE_1_RETROSPECTIVE.md) (what we learned) · [Volume 12](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md) (domain contract) · [Technical Debt](../roadmap/TECHNICAL_DEBT.md) · [Executive Dashboard](../roadmap/EXECUTIVE_DASHBOARD.md).*
*Host-specific operational details (addresses, ports, credentials) are intentionally excluded from this record and kept in protected operations documentation.*
