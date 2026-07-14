# Version 1.2 — Commercial Intelligence

> **Theme:** Enrich the data so underwriting and matching get better inputs.
> **Status:** 🔵 Architecture locked (2026-07-14); implementation not yet begun. Builds on the released [1.1](./VERSION_1_1.md) operational foundation (`v1.1.0`).
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
