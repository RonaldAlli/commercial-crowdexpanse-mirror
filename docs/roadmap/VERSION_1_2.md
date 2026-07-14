# Version 1.2 — Commercial Intelligence

> **Theme:** Enrich the data so underwriting and matching get better inputs.
> **Status:** 🔵 Planning (architecture only, no code). Builds on the released [1.1](./VERSION_1_1.md) operational foundation (`v1.1.0`).

## Goal
Turn thin records into decision-grade data. Each intelligence layer attaches structured signal to the entities the team already works, without changing the core workflow. This release is the data half of the [Intelligence Roadmap (Volume 5)](./AI_ROADMAP.md#volume-5--intelligence-roadmap) — deterministic enrichment, **no AI yet**.

## Scope

> The four intelligence layers below are the core of 1.2. Two operational carry-overs from 1.1 also land here (they reuse 1.1 platforms and don't affect the intelligence data model):
> - **Password Reset (Slice 3e, carried from 1.1):** self-serve reset on the 3d-i email platform (`MessageService`) — single-use, short-TTL, hashed reset tokens, its own stricter flow than invitations. Closes Tech-Debt **D10**. Independent of the intelligence work; can slice at any point in 1.2.
> - **Relation search (carried from 1.1 Better Lists):** seller-name on properties; property/seller/owner on opportunities & tasks — generalizing `lib/list-params.ts` for relation filters. Naturally complements the enrichment data.

### 1. Market Intelligence
Attach market context to `Property`/`Opportunity`: submarket, comps, rent/vacancy trends, cap-rate benchmarks by asset type and geography.
- **Foundation to reuse:** `Property.city/state/county`, `assetType`.
- **Data source decision required:** licensed feed vs. manual entry vs. public data (mirror the DealFlow "clean lane" discipline — legal before technical).

### 2. Owner Intelligence
Enrich `Seller` with ownership/entity signal: portfolio size, hold period, distress/motivation indicators, contactability.
- Ties directly to the North Star: better owner intelligence → better seller-source ROI.

### 3. Property Intelligence
Structured asset facts on `Property`: unit mix, year built, condition, tax/assessment, prior sales — feeding underwriting defaults.

### 4. Portfolio Intelligence
Org-level rollups: pipeline value by stage, exposure by market/asset type, source performance (closings per seller source), analyst throughput. Powers the Executive/Ops view.

## Architecture notes
- New data lands as **structured columns or child tables**, org-scoped, additive (no breaking changes to core records).
- Prefer deterministic enrichment (imports, joins) over inference. Any inference is flagged and reviewable.
- **Schema migrations** already resolved in 1.1 (Slice 3a-i adopted `prisma migrate`), so 1.2 schema growth rides on the existing migration history (see [Tech Debt](./TECHNICAL_DEBT.md)).

## Dependencies
- 1.1 permissions (who can see/edit enrichment).
- Data-source/legal decisions per layer (blocking, founder-owned).

## Definition of Done (1.2)
Global DoD **plus**: each intelligence layer has a documented source + refresh strategy, is org-scoped, and surfaces in the relevant record UI with provenance.

## Out of scope
Financial modeling depth (1.3), closing (1.4), AI-generated intelligence (2.0 — this release is deterministic enrichment only).
