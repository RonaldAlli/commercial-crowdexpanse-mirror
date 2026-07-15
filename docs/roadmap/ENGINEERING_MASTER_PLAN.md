# CrowdExpanse Commercial — Engineering Master Plan (EMP)

> **Status:** Living document · **Owner:** Engineering · **Last reviewed:** 2026-07-14
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
| 11 | [PERFORMANCE.md](./PERFORMANCE.md) | Latency baseline, budgets, and optimization records (PQ-3/PQ-4) |
| 12 | [COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md) | Version 1.2 design authority — owner/property/market/portfolio model, provenance, identity, scoring, refresh |
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
- **Observability/Performance:** unauthenticated `/api/health` liveness probe (`{status, dbMs, uptime, commit}`), a zero-dep dev-gated timing helper (`lib/telemetry.ts`), a seeded measurement harness (`npm run perf:measure`), and a standardized `EXPLAIN` helper (`npm run perf:explain`) with a recorded [performance baseline](./PERFORMANCE.md) (PQ-3, observational). Optimization is evidence-driven against that baseline: **PQ-4 complete** — PQ-4a narrowed the Opportunities-board query to a dedicated `select` (board p95 ~109 → ~43 ms, ≈57%, EXPLAIN-verified, no schema/index/cache change), and with every path then well within budget no further optimization was warranted. Pagination/virtualization/indexes/caching are documented as future scalability options, revisited only if a future baseline breaches a budget.
- **Testing/CI:** 15 E2E scripts (`scripts/e2e-*.mjs`) → dedicated `_test` DB with a no-override guard, plus a **`node:test`+`tsx` unit layer** (`tests/unit/**`, branch-coverage gate ≥90% critical / ≥80% overall). GitHub Actions CI (mirror, ephemeral Postgres) runs distinct blocking gates — **Typecheck → Lint → Unit → E2E → Build** (lint is `next lint`, blocking, PQ-2). Local: `test:ci` (typecheck + unit + E2E) + explicit `npm run lint`. See [Testing](./TESTING_ROADMAP.md).

### Data Flow
Browser → middleware (session gate) → Server Component (reads via Prisma, org-scoped) / Server Action (writes, revalidate) → Postgres. Documents stream through a Server Action to `UPLOAD_DIR`. Activity/notification rows are written alongside domain writes.

### Module Relationships
`Organization` owns everything. `Seller` → `Property` → `Opportunity` (pipeline) → `DealAnalysis` (underwriting) and `BuyerMatch` (→ `Buyer`). `Task`/`Note`/`Document`/`ActivityLog` attach to opportunities and records. See [FEATURE_DEPENDENCIES.md](./FEATURE_DEPENDENCIES.md).

**Version 1.2 (Commercial Intelligence)** adds a new canonical **`Owner`** domain — the durable title-holder that bears a portfolio and accumulates enrichment — distinct from `Seller` (the transaction counterparty), plus a `Market` reference entity and a shared **provenance spine**. All additive and org-scoped; **no core workflow changes**. **Slice 1's identity foundation is complete** (1a + 1a-2): `Owner`/`OwnerAlias`/`OwnerExternalIdentifier`, nullable `Seller.ownerId`/`Property.ownerId`, a deterministic proposal-only identity library (`lib/intelligence/owner-identity.ts`), and **reversible, structural-only, ADMIN-only merge/unmerge** (`OwnerMergeRecord`, chain resolution) — all upholding the [six identity invariants](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md#the-six-identity-invariants-non-negotiable--stable-across-all-providers); merged owners are never physically deleted. **Commit 1c is complete — the headless intelligence foundation is fully in place.** The `Observation → Signal → Projection` core pipeline (1b-1 + 1b-2) is an append-only, immutable ledger (`lib/intelligence/provenance.ts` — version-stamped, superseded-not-mutated, complete lineage) feeding a deterministic **projection engine** (`lib/intelligence/projection.ts` + `projection-precedence.ts`) that makes `Owner` columns disposable, ledger-backed projections under a total-order precedence rule (pin → asOf → confidence → source-category → id), with transactional writes, sticky overrides, and a byte-for-byte **reconstruction invariant**. Projection is *pure* — it only selects/orders/normalizes accepted Signals. On top sits the **ingestion path** (1c): a pure `SourceAdapter` contract (`lib/intelligence/sources/` — `fetch` + `map` only) and the `runRefresh` orchestrator (`lib/intelligence/refresh.ts`) that records observations → accepts signals → triggers projection, anchored by a durable `RefreshJob` (sole audit surface + idempotency). Refresh is **observational, replayable, atomic**; adapters are **pure** and stamp `adapterVersion` on every observation — so every future source (CSV, county, licensed, AI) is just another adapter while the orchestrator, ledger, and projection engine stay fixed. **Commit 1d-1 exposes this foundation through the first UI** (`app/(workspace)/owners/*`): Owner nav/list/detail/create/edit, built as a thin *consumer* — every mutation flows action → `lib/owners`/`lib/intelligence` → ledger → projection (the UI never writes `displayName`/`entityType`/`matchKey` directly), Owner detail renders each field as Projected Value → Winning Signal → Signal History, and the `OWNER` permission policy is enforced at its first call-sites. **Commit 1d-2a adds operational-graph linking** (Seller↔Owner, Property↔Owner) from both the Owner and Seller/Property pages: link, **atomic move** (re-link A→B in one `ownerId` update, audited `owner.linked`/`owner.moved`/`owner.unlinked`), and unlink — all kept strictly separate from canonical identity (linking edits only the FK and writes no Observation/Signal). **Commit 1d-2b adds standalone candidate review** — a duplicate-owner queue (`lib/intelligence/owner-duplicates` exact-matchKey + alias overlap → `lib/owner-match` decision store `OwnerMatchDecision`) where a human confirms/dismisses pairs (ADMIN reopen); dismissed pairs re-surface only on a material identity-fingerprint change. It is decision-support: it **records decisions only and never merges** — `CONFIRMED` pairs feed the 1d-3 merge queue. **Commit 1d-3a adds manual refresh controls** to Owner detail — a source-attributed trigger (`runRefresh` via the manual adapter, distinct from direct Edit) plus inline history of the 10 most recent Owner-specific `RefreshJob`s (`REFRESH` write = ADMIN/ACQUISITIONS, read = all). **Commit 1d-3b completes Slice 1 with the ADMIN-only merge/unmerge workspace** (`/owners/merges`) over the existing reversible engine, consuming `CONFIRMED` decisions: **merge is the only workflow permitted to perform structural identity change**, and **merge+decision-resolution (and unmerge+unresolution) each commit or roll back as one atomic transaction** — the merge engines were parameterized into tx-body form (`mergeOwnersTx`/`unmergeOwnersTx`, logic unchanged) so `lib/owner-merge` runs the structural change and the `OwnerMatchDecision` resolution write together (`resolvedAt`/`resolvedByUserId`/unique `mergeRecordId`; status stays `CONFIRMED`, no `MERGED` status). The winner is **suggested deterministically** (more linked records → older → smaller id, provider-neutral) but **never auto-applied** — an ADMIN explicitly confirms/swaps; unmerge returns the still-`CONFIRMED` pair to Awaiting Merge; the `OwnerMergeRecord` (+ resolution stamp) is the authoritative audit. **Slice 1 is now complete, accepted, and live in production** (1a/1a-2 → 1b → 1c → 1d-1…1d-3b). The entire 1.2 Owner UI (1d-1…1d-3b) is merged, built, prod-DB-current (10 migrations), and **deployed — serving build `9555QJiLxh4O9PrlVp3UH`, verified locally and externally**; [Tech Debt D5](./TECHNICAL_DEBT.md) (the stale-frontend blocker) is resolved with a permanent `prebuild` recurrence guard. Formal sign-off: [Slice 1 Production Acceptance Record](../releases/V1_2_SLICE_1_ACCEPTANCE.md). The full model, provenance, identity strategy, scoring, and refresh design are the design authority in **[Volume 12 — Commercial Intelligence Architecture](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)**.

### Security Model
Session-cookie auth → middleware gate → per-request `requireUser`/`requireRole` → org-scoped queries. `getCurrentUser` re-reads the user each request, so only `ACTIVE` accounts hold a live session; deactivation sets a per-user `sessionsValidAfter` epoch that invalidates every previously-issued cookie at once (stateless signed cookies, no server-side store). Uploads are size-capped and path-guarded. Secrets via env (`SESSION_SECRET`, `DATABASE_URL`). RBAC is enforced through the Authorization Principles below. **Redirects: `lib/safe-redirect.ts` is the canonical validator for any user-supplied redirect destination** (form `redirectTo`, `next` params, etc.) — it accepts internal relative paths only and rejects protocol-relative/absolute/backslash/control-char inputs. Server actions that redirect to a client-provided target MUST route it through `safeInternalPath()` rather than trusting it or hand-rolling a check (introduced with Owner linking, Commit 1d-2a). Future: audit hardening, rate limiting, and **password reset (Slice 3e, now scheduled in [1.2](./VERSION_1_2.md))** — see [Tech Debt](./TECHNICAL_DEBT.md).

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

> **How-to companion:** the [Engineering Playbook](../architecture/ENGINEERING_PLAYBOOK.md) is the living standard for *how* we execute this lifecycle — coding standards, testing patterns, the review checklist, anti-patterns, and the engineering decision framework. Each completed slice also gets a permanent retrospective under this directory (first: [Slice 1](./SLICE_1_RETROSPECTIVE.md)).

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
