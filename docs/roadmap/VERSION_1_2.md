# Version 1.2 — Commercial Intelligence

> **Theme:** Enrich the data so underwriting and matching get better inputs.
> **Status:** 🟡 In progress. Architecture locked (2026-07-14); **Slice 1 Commit 1d-1 complete** (2026-07-14) — the headless intelligence foundation (identity → ledger → projection → ingestion) is now **visible and usable** through the Owner UI, with `OWNER` permission enforcement live. Deployed 1a–1c to production; 1d-1 is UI-only (no schema change). Builds on the released [1.1](./VERSION_1_1.md) operational foundation (`v1.1.0`). Next: **Commit 1d-2** — Seller/Property linking + standalone candidate review.
> **Design authority:** **[Volume 12 — Commercial Intelligence Architecture](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)** is the canonical design for this release. This file is the release-scope summary; Volume 12 governs the model, provenance, identity, scoring, and refresh design. Where they differ, Volume 12 wins.

## Goal
Turn thin records into decision-grade data. Each intelligence layer attaches structured signal to the entities the team already works, without changing the core workflow. This release is the data half of the [Intelligence Roadmap (Volume 5)](./AI_ROADMAP.md#volume-5--intelligence-roadmap) — deterministic enrichment, **no AI yet**.

## Scope — four intelligence layers on one provenance spine
See [Volume 12 §2](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md#2-canonical-intelligence-model) for the canonical model. In brief:

1. **Owner Intelligence** *(primary — North Star)* — a **new first-class `Owner` entity** (canonical title-holder, distinct from the transaction-counterparty `Seller`): entity type, aliases, portfolio, hold period, distress/motivation, contactability.
2. **Property Intelligence** — structured asset facts on `Property` (unit mix, condition, tax/assessment, prior sales) feeding underwriting defaults.
3. **Market Intelligence** — a **new `Market`** reference entity keyed by **county × asset type**, with append-only trend snapshots (rent/vacancy/cap-rate).
4. **Portfolio Intelligence** — **Owner Portfolio** rollups (distress detection) + **Firm Book** org rollups (pipeline value, exposure, closings-per-source).

**Carried from 1.1** (independent; reuse existing platforms; don't block intelligence work):
- **Password Reset (Slice 3e):** self-serve reset on the `MessageService` email platform — single-use, short-TTL, hashed tokens. Closes Tech-Debt **[D10](./TECHNICAL_DEBT.md)**.
- **Relation search:** seller/property/owner filters generalizing `lib/list-params.ts` (best after the `Owner` entity lands in Slice 1).

## Locked architecture decisions (2026-07-14)
Full rationale in [Volume 12 §13](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md#13-locked-decisions).
- **A — Owner model:** new first-class `Owner`; **do not enrich `Seller` in place**.
- **B — Provenance:** hybrid — typed projections + provenance ledger (source of truth).
- **C — Refresh:** walking-skeleton — manual/on-demand in Slice 1, scheduled engine in Slice 6.
- **D — Scores:** every score = numeric value + graded band + explicit confidence.
- **E — Market grain:** county × asset type (extensible later).
- **F — Source sequence:** Owner → Property → Market; founder legal sign-off precedes each slice.
- **Identity:** canonical identity strategy (surrogate + match key + provider crosswalk) for Owner/Property/Market — [Volume 12 §7](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md#7-canonical-identity-strategy).

## Release slices
Seven intelligence slices, spine-first ([Volume 12 §9](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md#9-release-roadmap)): (1) Intelligence Spine + Owner foundation, (2) Property Intelligence, (3) Market Intelligence, (4) Portfolio Intelligence, (5) Cross-entity scoring, (6) Refresh engine, (7) UI integration — plus the two carried-over 1.1 items sequenced flexibly.

**Slice 1 progress — identity foundation complete:**
- ✅ **1a — Owner + identity foundation** (shipped 2026-07-14): `Owner`/`OwnerAlias`/`OwnerExternalIdentifier`, nullable `Seller`/`Property` links, deterministic identity library (proposal-only), permissions, tests; the [six identity invariants](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md#the-six-identity-invariants-non-negotiable--stable-across-all-providers) hold.
- ✅ **1a-2 — Owner merge/unmerge** (shipped 2026-07-14): reversible, structural-only, ADMIN-only, LIFO; `OwnerMergeRecord` with typed `mergeReason`; the reversibility golden invariant (snapshot → merge → unmerge → identical graph) is E2E-verified; merged owners are never physically deleted.
- **The identity spine is now complete.** Both migrations deployed to production.
- ✅ **1b-1 — Provenance ledger** (shipped 2026-07-14): the append-only `Observation → Signal` pipeline (immutable, supersession not mutation, version-stamped, complete lineage), headless provenance read API, idempotent genesis backfill. Deployed to production. *The system now stores sourced facts, not bare values.*
- ✅ **1b-2 — Projection engine** (shipped 2026-07-14): `Owner` columns are now ledger-backed **projections** — a deterministic, total-order precedence rule (pin → asOf → confidence → source-category → id), transactional `createOwner`/`updateOwnerField`, sticky overrides + clear, and the **reconstruction invariant** (rebuild from ledger == live projection, E2E-verified byte-for-byte). Migration-free.
- **Commit 1b is complete — the `Observation → Signal → Projection` core pipeline is in place.**
- ✅ **1c — Manual source adapter + refresh** (shipped 2026-07-14): the first general-purpose ingestion pipeline. A pure `SourceAdapter` contract (`fetch` + `map`), the USER_ENTERED `manualAdapter`, and the `runRefresh` orchestrator that feeds the ledger and triggers projection — with a durable `RefreshJob` (sole audit surface + idempotency anchor), client/​content-hash idempotency, and `adapterVersion` stamped on every observation. **Refresh is observational, replayable, and atomic; adapters are pure.** Deployed to production (migration 8). *Every future source — CSV, county, licensed, AI — is now just another adapter; the orchestrator, ledger, and projection engine stay fixed.*
- **Commit 1c is complete — the ingestion path is established and the intelligence foundation is fully headless.**
- ✅ **1d-1 — Core Owner UI** (shipped 2026-07-14): the first UI surface, built as a thin *consumer* of the pipeline. Owner nav + list (name search, sort, pagination, empty states, hide-merged default) + detail (projected header + per-field provenance laid out **Projected Value → Winning Signal → Signal History**) + create (with create-time duplicate warning) + edit via `updateOwnerField` (with override pins) + clear override. **The `OWNER` permission policy is now enforced** at its first call-sites (write ADMIN/ACQUISITIONS, read all). The UI never writes projections directly — every edit flows through the domain services. UI-only (migration-free). *Known future refinement: disable "Clear pin" when no alternate signal exists to fall back to.*
- **Commit 1d-1 is complete — `Observation → Signal → Projection` is now fully exposed through the UI.**
- ⏳ Next: **1d-2** — Seller↔Owner + Property↔Owner linking (primary workflow) + unlink + **standalone candidate review queue** (decision-support: confirm/dismiss). · **1d-3** — manual-refresh trigger + refresh-job history + merge/unmerge controls.

## Architecture notes
- New data lands as **structured columns + a provenance ledger**, org-scoped, additive (no breaking changes to core records).
- **Deterministic enrichment only** (imports, joins, calculations). Any inference is out of scope until 2.0.
- **Additive migrations** ride the existing `prisma migrate` history (Slice 3a-i baseline; see [Tech Debt](./TECHNICAL_DEBT.md)).
- Enriched read paths must stay **within the PQ-4 performance budgets** ([Volume 11](./PERFORMANCE.md)).

## Dependencies
- 1.1 permissions (who can see/edit enrichment).
- **Data-source/legal decisions per layer (blocking, founder-owned)** — Owner first (Decision F).

## Definition of Done (1.2)
Global DoD **plus**: each intelligence layer has a documented source + refresh strategy, carries provenance on every field, has a provider-stable canonical identity, is org-scoped, and surfaces in the relevant record UI with provenance — all within performance budget.

## Out of scope
Financial modeling depth (1.3), closing (1.4), AI-generated intelligence (2.0 — this release is deterministic enrichment only).
