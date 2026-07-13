# CrowdExpanse Commercial — Engineering Master Plan (EMP)

> **Status:** Living document · **Owner:** Engineering · **Last reviewed:** 2026-07-13
> This is the constitution of the project. Every feature, release, sprint, and AI session references it.
> When reality and this document disagree, fix one of them in the same change — never leave them drifted.

---

## How to use this document

1. **Before any work**, read the relevant Module Roadmap ([Volume 4](./MODULE_ROADMAPS.md)) and the target release (Volume 3 version files).
2. **Nothing skips a step.** Every change follows the [Development Lifecycle](#development-lifecycle).
3. **Every change updates the plan.** New known issue → [Technical Debt](./TECHNICAL_DEBT.md). Status change → [Executive Dashboard](./EXECUTIVE_DASHBOARD.md). New capability → its Module Roadmap.
4. **The Definition of Done is binding.** A feature is not "done" until it meets [every DoD item](#definition-of-done).

### Document map

| Volume | Document | Contains |
|---|---|---|
| 1 | This file — [Product Vision](#volume-1--product-vision) | Purpose, mission, principles, users, business model |
| 2 | This file — [System Architecture](#volume-2--system-architecture) | Current & future architecture, security, scoping, AI boundaries |
| 3 | [RELEASE_PLAN.md](./RELEASE_PLAN.md) + `VERSION_*.md` | Release strategy, per-version scope, checklists |
| 4 | [MODULE_ROADMAPS.md](./MODULE_ROADMAPS.md) | Per-module current/completed/future/dependencies/issues/testing/AI |
| 5 | [AI_ROADMAP.md](./AI_ROADMAP.md#volume-5--intelligence-roadmap) | Intelligence ladder (market → portfolio) |
| 6 | [AI_ROADMAP.md](./AI_ROADMAP.md) | AI capabilities: purpose/inputs/outputs/rules/failure/override/testing |
| 7 | [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) | Known issues, refactors, performance, scaling, security, infra |
| 8 | [TESTING_ROADMAP.md](./TESTING_ROADMAP.md) | Unit, integration, E2E, regression, perf, security, load, DR |
| 9 | [OPERATIONS_ROADMAP.md](./OPERATIONS_ROADMAP.md) | Release, rollback, backups, monitoring, incident, maintenance |
| 10 | [EXECUTIVE_DASHBOARD.md](./EXECUTIVE_DASHBOARD.md) | Module status/version/% complete table |
| — | [FEATURE_DEPENDENCIES.md](./FEATURE_DEPENDENCIES.md) | What must exist before what |

---

## Volume 1 — Product Vision

> **Founder-input notice.** Sections marked _(confirm)_ are engineering's best inference from the codebase and prior context (assignment-fee pipeline, "seller inventory is the scarce asset"). The founder should ratify or correct them; they then become binding.

### Purpose
CrowdExpanse Commercial is the operating system for a commercial real estate (CRE) **deal-origination business**: it turns raw seller leads into closed, assigned transactions. It is the system of record for sellers, buyers, properties, and the live acquisition pipeline, and the system of work for the team that moves deals from lead to paid.

### Mission _(confirm)_
Give a CRE acquisitions team an unfair operational advantage: never lose a motivated seller, never mis-underwrite a deal, never let a matched buyer go cold — and do it with a small team.

### North Star _(confirm)_
**Closed assignments per quarter** (deals reaching `PAID`), with a health metric of **closings per seller source** — because the scarce, defensible asset is *motivated seller inventory*, not buyers or software.

### Guiding Principles
1. **Seller inventory is the moat.** Optimize the system around capturing, retaining, and converting motivated sellers.
2. **Don't overbuild.** Ship the smallest slice that delivers real operational value; expand only when usage demands it. (House rule.)
3. **Deterministic before intelligent.** Prove the workflow with hand-written rules; add intelligence only over workflows that already exist and are trusted.
4. **Every deal is org-scoped and auditable.** Multi-tenant isolation and an activity trail are non-negotiable.
5. **Tests are part of the feature.** No merge without the test that protects it.
6. **The plan is code-adjacent.** Roadmap lives in the repo and moves with the code.

### Success Metrics
- **Product:** closed assignments/quarter; pipeline conversion by stage; time-in-stage; underwriting turnaround; seller-source ROI.
- **Engineering:** CI green rate; mean time to review→merge; E2E coverage of critical paths; production incidents/quarter; p95 page latency.

### Target Users _(confirm)_
- **Acquisitions** (`ACQUISITIONS`) — sources sellers, works the pipeline.
- **Analysts** (`ANALYST`) — underwrite deals in the Analyzer.
- **Dispositions** (`DISPOSITIONS`) — match and place deals with buyers.
- **Admins** (`ADMIN`) — run the org, manage the team.
- (Future external portals: sellers, buyers, partners — see DealFlow sibling framing.)

### Business Model _(confirm)_
Assignment-fee / wholesale CRE: contract motivated sellers, underwrite, and assign the contract to a capital-partner buyer for a fee (`Opportunity.assignmentFeeUsd`). Software is the internal operating leverage; the revenue is the spread on closed deals.

### Competitive Position _(confirm)_
Off-the-shelf CRM (e.g. generic pipelines) doesn't understand CRE underwriting or assignment mechanics; CRE analytics tools (CoStar-class) don't run your deal flow. CrowdExpanse Commercial is the **vertical operating system** that unifies seller inventory, underwriting, buyer matching, and closing in one org-scoped workflow.

### Long-Term Vision
From an internal deal-flow tool → to an intelligence-augmented CRE origination platform: market/owner/property/portfolio intelligence feeding underwriting and matching, with AI assistance layered on top of trusted, deterministic workflows. Automation of marketing and communication closes the loop from lead sourcing to closing.

---

## Volume 2 — System Architecture

### Current Architecture
- **Framework:** Next.js 14.2 (App Router), React 18, TypeScript. Server Components + Server Actions; minimal client JS. Pages are `force-dynamic`.
- **Data:** PostgreSQL 16 via Prisma 5. Schema is **migration-managed** (`prisma migrate`, baseline `0_init`). Author changes on the no-shadow path — `prisma migrate diff … --script` into a new `prisma/migrations/<ts>_name/` folder, then `prisma migrate deploy` (the app DB role has no CREATEDB, so `migrate dev`'s shadow DB is unavailable). Test tooling and CI run `migrate deploy`.
- **Auth:** Cookie session (`ce_commercial_session`); `middleware.ts` redirects unauthenticated traffic to `/login`; `lib/auth.ts` provides `requireUser`/`requireRole`.
- **Authorization:** Role model (`ADMIN`, `ACQUISITIONS`, `ANALYST`, `DISPOSITIONS`) via `lib/authz.ts` (e.g. last-admin protection).
- **Multi-tenancy:** Every domain model carries `organizationId`; all queries scope by it. This is the core security invariant.
- **Storage:** Documents on local filesystem under `UPLOAD_DIR` (25 MB cap, path-traversal guard in `lib/storage.ts`); metadata in Postgres.
- **Communications:** One seam — `MessageService` (`lib/email/`) owns template selection, rendering, transport selection, and an `EmailMessage` outbox (persist-then-send). Features call only `messageService.send(...)`. `MessageKind` is a **closed, typed registry** — each kind declares a payload type + template + **retry policy** (`inline-only` | `drainable` | `manual-only`), enforced at compile time. Transports are pluggable (`console` default, `smtp` via nodemailer; API providers drop in without interface change). The outbox stores **metadata only** — never the rendered body, links, or tokens (`templateVersion` gives reproducibility instead). **Invitation delivery** is the first consumer: `inline-only` (one best-effort send, no background retry, no automatic token rotation — only the explicit admin Resend rotates); drainable kinds reconstruct data from the source of truth via a per-kind resolver. Config is fail-fast in `lib/env.ts`.
- **Domain modules:** Sellers, Buyers, Properties, Opportunities (13-stage pipeline), Deal Analyzer (`DealAnalysis`), Buyer Matching (`lib/matching.ts`), Tasks, Notes, Documents, Notifications/Activity, Team (member lifecycle), Invitations (resend/token rotation), Organization Settings (`OrganizationSettings`, `lib/org-settings.ts` — configurable invite expiry + default role; drives invitation creation), Communications (`lib/email/*`, `EmailMessage` outbox — MessageService → Template → EmailTransport; closed typed message registry with per-kind retry policy; consumed by invitation delivery), Global Search.
- **Deployment:** Node build served by pm2 (`crowdexpanse-commercial`, port 3030) behind Caddy; single VPS. See [Operations](./OPERATIONS_ROADMAP.md).
- **Testing/CI:** 15 E2E scripts (`scripts/e2e-*.mjs`) → dedicated `_test` DB with a no-override guard, plus a **`node:test`+`tsx` unit layer** (`tests/unit/**`, branch-coverage gate ≥90% critical / ≥80% overall). GitHub Actions CI (mirror, ephemeral Postgres) runs distinct blocking gates — **Typecheck → Lint → Unit → E2E → Build** (lint is `next lint`, blocking, PQ-2). Local: `test:ci` (typecheck + unit + E2E) + explicit `npm run lint`. See [Testing](./TESTING_ROADMAP.md).

### Data Flow
Browser → middleware (session gate) → Server Component (reads via Prisma, org-scoped) / Server Action (writes, revalidate) → Postgres. Documents stream through a Server Action to `UPLOAD_DIR`. Activity/notification rows are written alongside domain writes.

### Module Relationships
`Organization` owns everything. `Seller` → `Property` → `Opportunity` (pipeline) → `DealAnalysis` (underwriting) and `BuyerMatch` (→ `Buyer`). `Task`/`Note`/`Document`/`ActivityLog` attach to opportunities and records. See [FEATURE_DEPENDENCIES.md](./FEATURE_DEPENDENCIES.md).

### Security Model
Session-cookie auth → middleware gate → per-request `requireUser`/`requireRole` → org-scoped queries. `getCurrentUser` re-reads the user each request, so only `ACTIVE` accounts hold a live session; deactivation sets a per-user `sessionsValidAfter` epoch that invalidates every previously-issued cookie at once (stateless signed cookies, no server-side store). Uploads are size-capped and path-guarded. Secrets via env (`SESSION_SECRET`, `DATABASE_URL`). RBAC is enforced through the Authorization Principles below. Future: audit hardening, rate limiting, password reset — see [Tech Debt](./TECHNICAL_DEBT.md) and [1.1](./VERSION_1_1.md).

### Authorization Principles
The permission model has one policy source (`lib/permissions.ts`, pure) and one enforcement/audit layer (`lib/authorize.ts`). Every contributor must follow these rules; the [Permissions module roadmap](./MODULE_ROADMAPS.md#permissions) links here.

1. **UI is never authoritative.** Hidden buttons and route guards are convenience and defense-in-depth only. The server is the sole source of truth.
2. **Server actions always enforce permissions.** Every write-bearing server action checks the policy before mutating — never rely on the caller having been gated upstream.
3. **`authorization.denied` is logged only for attempted mutations.** A denied *action* is a security event and is recorded (actor, role, resource, action, target, timestamp). Page loads, hidden-control checks, and route-guard `notFound()`s are **not** logged — use the pure `can()`/`canMoveStage()` for those, and `authorize()`/`checkAuthorized()`/`authorizeStageMove()` (which log) only inside server actions.
4. **Every new write action must call `authorize()`** (or `checkAuthorized()` for state-returning actions; the stage-move variants for pipeline changes). No write reaches Prisma without passing the policy.
5. **Every new feature must declare its resource/action mapping** in `lib/permissions.ts` (the `Resource`/`Action` matrix, and `canMoveStage` for any staged workflow) — the matrix is the single place the model is defined.

### Organization Scoping
The load-bearing invariant: **no query crosses `organizationId`.** Every new model, query, and E2E must assert org isolation (the E2E suite already does per module).

### AI Boundaries
AI is **out of scope until Volume 6 / v2.0.** When introduced: AI never writes to the DB without human confirmation; every AI output has a deterministic fallback and a human override; AI is scoped to a single org's data. See [AI_ROADMAP.md](./AI_ROADMAP.md).

### Deployment Architecture
Single VPS, pm2-managed Next server on :3030, Caddy TLS/reverse-proxy, local Postgres 16, local document volume. CI builds on GitHub-hosted runners against an ephemeral Postgres. Future: managed DB, object storage, staging environment — see [Operations](./OPERATIONS_ROADMAP.md).

### Testing Architecture
See [Volume 8](./TESTING_ROADMAP.md). Today: deterministic E2E integration scripts against a dedicated test DB behind a `_test`-only guard, plus a pure-logic unit layer (`node:test`+`tsx`, `tests/unit/**`) with an enforced branch-coverage gate — line coverage is unreliable under `tsx` so branch% is the gate (revisit on a Node 22 upgrade, [D11](./TECHNICAL_DEBT.md)). Run locally (`npm test`, `npm run test:unit`) and in CI (`test:ci` + build).

---

## Development Lifecycle

Every feature — human- or AI-authored — follows this, in order. **Nothing skips a step.**

```
Roadmap → Architecture → Specification → Implementation → Testing → Documentation → Merge → Release
```

1. **Roadmap** — the work exists in a version file and its Module Roadmap.
2. **Architecture** — confirm it fits Volume 2 (scoping, security, boundaries); note deviations.
3. **Specification** — a short written slice: scope, non-goals, data changes, acceptance criteria.
4. **Implementation** — smallest coherent slice; matches surrounding code idiom.
5. **Testing** — E2E (and unit where logic warrants) proving the acceptance criteria; org isolation asserted.
6. **Documentation** — update the Module Roadmap, Dashboard %, and any new Tech Debt.
7. **Merge** — feature branch → verify (typecheck, `npm test`, isolated build) → fast-forward to `main` → push both remotes.
8. **Release** — grouped into a version per [RELEASE_PLAN.md](./RELEASE_PLAN.md); tag when the version's checklist passes.

## Definition of Done

A change is **Done** only when all hold:
- [ ] Scoped to a slice with written acceptance criteria.
- [ ] Org-scoped; no cross-tenant leakage; roles enforced where relevant.
- [ ] `npm run typecheck` clean.
- [ ] Focused E2E added/updated and `npm test` green on the `_test` DB.
- [ ] Build passes (`npm run build` in CI; `build:isolated` locally).
- [ ] No unrelated files; no schema drift unless intended and reviewed.
- [ ] Module Roadmap + Executive Dashboard updated; new debt logged.
- [ ] Merged to `main` and pushed to Gitea + GitHub mirror.

## Governance
- The EMP is reviewed at the start of every release.
- Any architectural decision that contradicts Volume 2 requires an explicit note here (an ADR entry) before merge.
- The Executive Dashboard is the single source of truth for "what state is each module in."
