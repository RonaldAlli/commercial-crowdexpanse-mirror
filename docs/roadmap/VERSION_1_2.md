# Version 1.2 — Commercial Intelligence

> **Theme:** Enrich the data so underwriting and matching get better inputs.
> **Status:** 🟡 In progress. Architecture locked (2026-07-14); **Slice 1 COMPLETE, ACCEPTED, and LIVE in production** (final commit **1d-3b — merge/unmerge controls** — shipped 2026-07-15; production-closed 2026-07-15). Slice 1 code is complete, merged, tested, built, production-database-current (**10 migrations**; 1d-3b added `20260714232459_add_match_decision_resolution`), and the frontend is **deployed and serving build `9555QJiLxh4O9PrlVp3UH`** (verified locally + externally). Formal sign-off: **[Slice 1 Production Acceptance Record](../releases/V1_2_SLICE_1_ACCEPTANCE.md)**. [Tech-Debt D5](./TECHNICAL_DEBT.md) (the stale-frontend blocker) is **resolved**, with a permanent `prebuild` recurrence guard. Builds on the released [1.1](./VERSION_1_1.md) operational foundation (`v1.1.0`). ✅ The 1.2 Owner UI (1d-1…1d-3b) is now user-accessible in production. **Slice 2 (Property Intelligence): architecture-locked 2026-07-15; Commit 2a (Property on the shared spine) merged + production-migrated — prod now at 11 migrations, `IntelligenceEntityType = {OWNER, PROPERTY}`.** **Slice 2 Commit 2b (Property provenance UI + manual-refresh surface) is COMPLETE, MERGED, and DEPLOYED (2026-07-15)** — the redeploy made the 2a ledger write-path live (build-ID flip verified on disk + externally), closing [D13](./TECHNICAL_DEBT.md); Property detail now shows per-field provenance + a REFRESH-gated refresh surface, reusing the generalized `FieldProvenanceCard`. Migration-free (still **11 migrations**). **Next: Slice 2 Commit 2c.**
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
- ✅ **1d-2a — Linking / unlinking** (shipped 2026-07-14): Seller↔Owner and Property↔Owner linking from both the Owner page (primary) and the Seller/Property pages, with **atomic move** (re-link A→B in one `ownerId` update, audited as `owner.linked`/`owner.moved`/`owner.unlinked`), one-click unlink, and link-to-existing-only pickers. **Linking never changes identity** — it edits only the operational FK, writing no Observation/Signal (E2E-proven). Added the pure `safe-redirect` open-redirect guard. UI-only (migration-free).
- **Commit 1d-2a is complete — operational-graph linking is separate from canonical identity.**
- ✅ **1d-2b — Standalone candidate review** (shipped 2026-07-14, prod migration 8→9): a duplicate-owner review queue (Pending / Dismissed / Awaiting-merge) with Confirm / Dismiss (`OWNER_IDENTITY`) and ADMIN Reopen. Generation is **exact `matchKey` + alias overlap only** (no fuzzy); pairs use a canonical unordered identity; a dismissed pair re-surfaces only on a **material identity-fingerprint change** or explicit ADMIN reopen. **Records human decisions only — never merges, links, creates/deletes owners, or writes Observations/Signals** (`OwnerMatchDecision`). Confirmed pairs feed the 1d-3 merge queue.
- **Commit 1d-2b is complete — candidate review (decision-support) is separate from merge.**
- ✅ **1d-3a — Manual refresh controls** (shipped 2026-07-14, migration-free): a source-attributed manual-refresh trigger on Owner detail (records an observation through the manual adapter → accepts signals → runs projection → logs a `RefreshJob`, explicitly distinct from direct Edit) + inline history of the 10 most recent Owner-specific jobs. First UI call-sites of `REFRESH` (trigger = ADMIN/ACQUISITIONS; history = all roles). Merged + built + prod-DB-current; awaiting frontend redeploy (D5).
- **Commit 1d-3a is complete — the ingestion pipeline now has a UI trigger + audit history.**
- ✅ **1d-3b — Merge/unmerge controls** (shipped 2026-07-15, prod migration 9→10): the ADMIN-only merge workspace (`/owners/merges` + `/owners/merges/[id]`) over the existing reversible merge engine, consuming `CONFIRMED` candidate decisions. **Merge and its decision resolution are one atomic transaction; unmerge and decision restoration are one atomic transaction** — the merge/unmerge engines were parameterized into tx-body form (`mergeOwnersTx`/`unmergeOwnersTx`, logic unchanged) so `lib/owner-merge` runs the structural change and the `OwnerMatchDecision` resolution write in the same transaction (rollback proven both directions). `OwnerMatchDecision` gains `resolvedAt`/`resolvedByUserId`/`mergeRecordId` (unique) — **status stays `CONFIRMED`, no `MERGED` status**; a merge stamps resolution and the pair leaves the queue, an unmerge clears exactly the linked decision and returns the still-`CONFIRMED` pair to Awaiting Merge. Winner is **suggested deterministically** (more linked records → older → smaller id; provider-neutral) but **never auto-applied** — the ADMIN explicitly confirms/swaps. Candidate Review stays decisions-only. The `OwnerMergeRecord` (+ resolution stamp) is the authoritative audit (no duplicate event).
- **Commit 1d-3b is complete — merge is the only workflow permitted to perform structural identity change, and it is atomic with decision resolution.**
- 🎉 **Slice 1 implementation is complete** (1a/1a-2 → 1b-1/1b-2 → 1c → 1d-1 → 1d-2a → 1d-2b → 1d-3a → 1d-3b). Code merged, tested, built, production-database-current, **deployed, and accepted live in production**.

### Slice 1 production closure — ✅ COMPLETE (2026-07-15)
Slice 1 is **production-closed**. The frontend is serving the new build (`9555QJiLxh4O9PrlVp3UH`, verified locally + externally) and the release is formally accepted. Closure sequence, all done:
1. ✅ **[D5](./TECHNICAL_DEBT.md) resolved** — `.next` ownership corrected (`chown -R deploy:deploy`), rebuilt as `deploy`, app restarted; build-ID flip verified. Permanent `prebuild` guard added (`scripts/predeploy-check.mjs`).
2. ✅ **Authorization verified** — ADMIN surfaces (owners, candidates, `/owners/merges`, refresh) function; non-ADMIN blocked server-side (merge/unmerge ADMIN-only, defense in depth). Method: full E2E suite + server-side code audit + read-only production probes (interactive human click-through recommended as optional final smoke). See [Acceptance §7–8](../releases/V1_2_SLICE_1_ACCEPTANCE.md#7-admin-acceptance).
3. ✅ **Acceptance record created** — [`docs/releases/V1_2_SLICE_1_ACCEPTANCE.md`](../releases/V1_2_SLICE_1_ACCEPTANCE.md).
4. ✅ **Slice 1 marked fully closed** (this doc + [Dashboard](./EXECUTIVE_DASHBOARD.md)).
5. ✅ **Slice 2 (Property Intelligence) architecture lock complete** (2026-07-15) — see below.

## Slice 2 — Property Intelligence (in progress)
Slice 2 extends the shared intelligence substrate to a second canonical entity: **Property runs on the same `Observation → Signal → Projection` spine as Owner — not a second provenance system.** Architecture-locked 2026-07-15 (scope per [Volume 12 §9](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md#9-release-roadmap)). Deterministic, additive, org-scoped — no AI, no external source in the skeleton.

**Commit 2a — Property on the spine (headless) — ✅ COMPLETE · MERGED · PRODUCTION-MIGRATED (2026-07-15):**
- ✅ **2a-i — Entity-projector registry** (behavior-preserving): the refresh/projection substrate dispatches per-entity through a **dispatch-only** registry (`lib/intelligence/entity-registry.ts`); Owner behavior is unchanged (proven by the unchanged Owner E2E + the reconstruction test). Established the **Projection Reconstruction Standard** in the [Playbook](../architecture/ENGINEERING_PLAYBOOK.md).
- ✅ **2a-ii — Property intelligence spine**: `PROPERTY` added to `IntelligenceEntityType` (additive migration, **prod 10→11**); the smallest immutable physical-facts projected set (**`yearBuilt`, `squareFeet`**; `unitCount`/unit-mix deferred), a Property projection writer + pure `USER_ENTERED` manual adapter, and `lib/properties.ts` domain writes that route projected fields through the ledger (operational columns direct) in one transaction, with an idempotent genesis backfill (`asOf = createdAt`). Property CRUD actions became thin domain-service callers. A **multi-entity isolation** E2E proves Owner and Property refreshes never cross.
- **Production landing (2026-07-15):** FF-merged to `main` + dual-pushed; fresh restore-verified backup taken; enum migration applied (prod at **11 migrations**); genesis backfill run across all orgs — prod currently has **0 properties**, so a clean no-op (idempotency proven); data-layer verification green (reconstruction, org-scoping, **Owner ledger byte-for-byte unchanged**, health OK, no 500s).
- ✅ **Headless landing resolved at 2b** ([D13](./TECHNICAL_DEBT.md)): 2a merged the ledger write-path without redeploying; **Commit 2b redeployed it** (build-ID `9555QJiLxh4O9PrlVp3UH` → `4A-bszK-FtpZr-w48yTP_`, verified on disk, locally, and externally), so the running app now uses the ledger write-path.

**Commit 2b — Property provenance UI + manual-refresh surface — ✅ COMPLETE · MERGED · DEPLOYED (2026-07-15):**
- A **thin UI consumer** over the already-complete Slice-2 services — no new intelligence logic, **no schema change, migration-free**. Property detail now renders per-field provenance for `yearBuilt`/`squareFeet` (Projected Value → Winning Signal → Signal History) and a `REFRESH`-gated manual-refresh surface with a 10-row job history — the same infrastructure the Owner detail page uses.
- The previously Owner-specific provenance component was **generalized** to `FieldProvenanceCard` (`components/field-provenance.tsx`) now that Property is a second real consumer (behavior-preserving; Owner page updated). `triggerPropertyRefreshAction` mirrors the Owner refresh action over `propertyManualAdapter`; the form adds client `min`/`max` + numeric input hints while **normalization stays server-authoritative**.
- **Behavior clarified (discovered during 2b):** an invalid Property refresh value (e.g. out-of-range `yearBuilt`) is **rejected → the run FAILS with a reason**, never silently converted to NOOP. This is the documented, tested behavior (E2E assertion added).
- **Deployment (D13 closure):** FF-merged + dual-pushed; fresh restore-verified backup; built as `deploy` + PM2 restarted; served build-ID flip verified (disk + external); genesis backfill re-run (0 backfilled — 0 prod properties), idempotency + reconstruction proven, **Owner byte-for-byte unchanged**; production smoke incl. the **Owner → Property → Owner shared-component regression** (no state leak, entity-scoped provenance/history) and REFRESH role gating.

**Next — Commit 2c (Property Identity):** requires a **fresh architecture lock** — it introduces canonical Property identity (parcel/APN, FIPS, normalized address, external-identifier crosswalk, deterministic candidate matching), which is materially different from the projection/refresh work of 2a/2b and must not be treated as the next coding task. Entry checkpoint: **[V1.2 Midpoint Architecture Status](../architecture/V1_2_ARCHITECTURE_STATUS.md)** (what is validated, what remains a hypothesis, and what is frozen).

**Deferred within Slice 2 (gated on founder Property-source sign-off, Decision F):** PropertyIdentity (parcel/APN + county FIPS + normalized address/geocode + crosswalk + dedup) and the richer approved signal set (tax/assessment, prior sales, condition, full unit-mix). The skeleton is `USER_ENTERED`-only to proceed unblocked.

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
