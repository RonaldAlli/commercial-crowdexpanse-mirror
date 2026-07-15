# Version 1.2 — Midpoint Architecture Status

> **What this is:** a checkpoint taken after two canonical entities (Owner, Property) have shipped end-to-end on the shared intelligence substrate. It records which architectural bets are now *validated by production evidence*, which remain *hypotheses*, which patterns are *stable enough to reuse without debate*, which extension points have been *proven by a second consumer*, and what is now *frozen behind an architectural-review gate*.
>
> **What this is not:** it is not a retrospective (see [Slice 1 Retrospective](../roadmap/SLICE_1_RETROSPECTIVE.md)), not a playbook (see [Engineering Playbook](./ENGINEERING_PLAYBOOK.md)), and **not a redesign**. The design authority remains **[Volume 12 — Commercial Intelligence Architecture](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)**; this document only reports status against it.
>
> **Purpose:** the entry checkpoint before **Commit 2c (Property Identity)** — the first slice to introduce *canonical identity for a second entity* (parcel/APN, FIPS, normalized address, external-identifier crosswalk, deterministic candidate matching). 2c is not a coding task; it requires a **fresh architecture lock** (see §F).
>
> **Last reviewed:** 2026-07-15. **Substrate proven by:** Slice 1 (Owner, 1a→1d-3b, LIVE) + Slice 2 Commits 2a (Property on the spine) + 2b (Property provenance UI + refresh), both LIVE. Prod at 11 migrations; [D5](../roadmap/TECHNICAL_DEBT.md) and [D13](../roadmap/TECHNICAL_DEBT.md) resolved.

---

## A. Assumptions now VALIDATED (by production evidence)

Each row is an architectural bet made in Slice 1 that a second entity has now *tested*, not merely asserted.

| # | Assumption | How it was validated |
|---|---|---|
| A1 | **The spine is entity-polymorphic, not Owner-shaped.** `Observation`/`Signal`/`RefreshJob` key on `(entityType, entityId)` with no `ownerId` FK. | Property rode the *same* tables with only an additive `IntelligenceEntityType` enum value — no new ledger, no schema fork. (2a-ii) |
| A2 | **Extend, don't fork.** New entities are added by *parameterizing* the seam, not duplicating the engine. | The dispatch-only **entity-projector registry** (`lib/intelligence/entity-registry.ts`) generalized the refresh/projection seam **behavior-preservingly** — Owner E2E + reconstruction unchanged. (2a-i) |
| A3 | **Projections are disposable; the ledger is truth.** | The **Projection Reconstruction Standard** holds for both entities: `rebuildOwner` (`e2e-projection §5`) and `rebuildProperty` (`e2e-property-projection §4`) reproduce columns byte-for-byte from the ledger. Re-run live in the 2b release. |
| A4 | **Thin UI consumes domains; it never writes projected state.** | Property CRUD + refresh route every projected write (`yearBuilt`/`squareFeet`) through `lib/properties.ts` → ledger → projection. The UI renders provenance and dispatches actions only. (2a-ii, 2b) |
| A5 | **Pure adapters + a fixed orchestrator absorb new sources.** | A second `SourceAdapter` (`propertyManualAdapter`) slotted into the unchanged `runRefresh` orchestrator; `RefreshJob` remained the sole audit + idempotency surface. (2a-ii) |
| A6 | **Multi-entity isolation is structural, not incidental.** | `e2e-property-refresh §5` proves interleaved Owner/Property refreshes never touch each other's projection, provenance, or jobs. The 2b smoke re-proved it at the render layer (Owner→Property→Owner, no state leak). |
| A7 | **Authorization is policy-as-data, reusable across entities.** | `PROPERTY` and `REFRESH` resources reused the existing `MATRIX` in `lib/permissions.ts`; the Property refresh surface is gated by the *same* `REFRESH` policy that gates Owner. (2b) |
| A8 | **Generalize only after a second real consumer exists.** | The provenance component stayed Owner-specific until Property arrived, then became the shared `FieldProvenanceCard` — a behavior-preserving rename with two proven consumers. Now a named Playbook principle. (2b) |
| A9 | **Genesis backfill is a safe, idempotent, additive migration of pre-ledger columns.** | Run across all orgs at 2a and again at 2b; idempotent (2nd pass 0) and additive (no column mutation) in both. |

---

## B. Assumptions that remain HYPOTHESES (not yet validated)

These are **not** failures — they are bets the work so far has *not exercised*. Naming them prevents "two entities work" from being mistaken for "the design is proven at large."

| # | Hypothesis | Why it is still open | Where it gets tested |
|---|---|---|---|
| B1 | **The precedence rule holds under real multi-source contention.** | Only the `USER_ENTERED` source category is live. `LICENSED`/`PUBLIC`/`CALCULATION` exist in the model and unit tests, but **no non-manual adapter has shipped**. The total-order tiebreak (pin → asOf → confidence → source-category → id) is unit-proven, not production-proven. | First licensed/public Property or Owner adapter (gated on Decision F / Volume 12 §8). |
| B2 | **The Owner identity pattern generalizes to Property.** | Owner identity (matchKey, aliases, external identifiers, reversible merge/unmerge) is proven. **Property identity is entirely unbuilt** and is *materially different*: parcel/APN is unique only *within* a FIPS jurisdiction, address needs normalization + geocode, and there is no natural-person name to key on. Reusing `OwnerIdentity`/`OwnerMergeRecord` shapes for Property is an **assumption, not a result**. | **Commit 2c** (see §F) — this is precisely why 2c needs a fresh lock. |
| B3 | **Reconstruction / idempotency hold at real volume.** | Prod currently has **0 owners, 0 properties, 1 org**. Every backfill and reconstruction proof to date ran on empty or tiny throwaway sets. Ledger-read performance for intelligence entities at scale is unmeasured (distinct from the 1.1 board/search budgets in [Volume 11](../roadmap/PERFORMANCE.md)). | First real ingestion at volume; a perf baseline for provenance reads. |
| B4 | **"Second canonical entity" implies N entities.** | Two consumers prove *reusability*; they do not prove the substrate scales to `Market`/`Portfolio`, which have different identity and refresh shapes (Volume 12 §6, §7.3). | Market on the spine (a later slice). |
| B5 | **Genesis backfill behaves on populated data.** | It has only ever run as a **no-op** (0 records). Its behavior seeding real pre-ledger rows with `asOf = createdAt` is untested against production data. | First org with pre-existing Property/Owner rows. |

---

## C. Reusable patterns now considered STABLE

Safe to reuse in future slices without re-litigation. All are proven by ≥2 consumers or ≥1 full production cycle.

- **`Observation → Signal → Projection` ledger** — append-only, immutable, supersession-not-mutation, version-stamped, complete lineage (`lib/intelligence/provenance.ts`).
- **Entity-projector registry** — dispatch-only lookup (`resolveTarget` / `isProjectedField` / `recomputeField`); **never** holds business logic.
- **`SourceAdapter` contract + `runRefresh` + `RefreshJob`** — pure `fetch`/`map` adapters; the orchestrator and audit surface are fixed.
- **Projected-field module** — a pure, DB-free field set + normalizer per entity (`owner-fields`, `property-fields`).
- **Projection writer + `rebuild<Entity>`** — typed-column writer backed by the ledger, paired with a reconstruction test.
- **Genesis backfill** — idempotent, additive, `asOf = createdAt`, org-scoped; preview read-only before prod.
- **CRUD → domain service** — actions validate + authorize, then delegate; operational persistence and intelligence orchestration stay in separate services.
- **Thin intelligence UI** — `getFieldProvenance` + `listRefreshJobsForEntity` + shared `FieldProvenanceCard` + an entity-mirrored refresh action.
- **Testing patterns** (Playbook §4) — reconstruction, multi-entity isolation, shared-component regression, production-smoke-without-customer-data, forced-rollback, cross-org scoping, permission-denial.
- **No-shadow migration procedure** + release-step production migration (backup → one pending migration → `migrate deploy` → verify).
- **Dual-remote release** (gitea + github) with restore-verified backup, build-as-`deploy`, served-build-ID verification (disk + external), and the `prebuild` root/ownership guard (D5).

---

## D. Extension points PROVEN by a second consumer

The exact surfaces a future entity plugs into — each already carries two real implementations (Owner + Property), so their contracts are load-bearing, not speculative.

| Extension point | Contract | Consumers |
|---|---|---|
| `IntelligenceEntityType` + `entityId: string` addressing | The universal ledger key | OWNER, PROPERTY |
| `ENTITY_PROJECTORS` registry | `{ resolveTarget, isProjectedField, recomputeField }` | OWNER, PROPERTY |
| Projected-field module | `PROJECTED_FIELDS` + `normalize<Entity>Value` | owner-fields, property-fields |
| Projection writer + `rebuild<Entity>` | ledger → typed columns; reconstruction test required | Owner, Property |
| Per-entity manual `SourceAdapter` | `sourceKey`, `sourceCategory`, `adapterVersion`, `fetch`/`map` | `manual`, `manual:property` |
| `getFieldProvenance(org, FieldRef)` | entity-agnostic provenance read | Owner, Property fields |
| `listRefreshJobsForEntity(org, entityType, id)` | entity-scoped history | Owner, Property |
| `FieldProvenanceCard` | stateless render of Projected Value → Winning Signal → History | Owner, Property |
| Per-entity refresh action | mirror: swap `targetEntityType` + adapter + field set | `triggerRefreshAction`, `triggerPropertyRefreshAction` |
| `Resource` + `MATRIX` (`lib/permissions.ts`) | policy-as-data, server-enforced | OWNER, PROPERTY, REFRESH, … |

---

## E. FROZEN — do not change without an explicit architectural review

These are the invariants the whole substrate depends on. A change here is not a coding task; it requires reopening [Volume 12](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md) and an explicit lock. (Canonical invariants: Volume 12 §3, §13; six identity invariants: §7.)

1. **Ledger immutability.** A signal is never edited or deleted; a correction is a *new* superseding signal (Volume 12 §3 immutability invariant).
2. **Total-order precedence.** `pin → asOf → confidence → source-category → signal-id`, deterministic, entity-agnostic (`projection-precedence.ts`).
3. **Projection purity.** Projection only *selects / orders / normalizes* accepted signals — no I/O, no permissions, no inference.
4. **Projection Reconstruction Standard.** No ledger-backed projection ships without a passing byte-for-byte rebuild test.
5. **Registry is dispatch-only.** No entity business logic inside the registry.
6. **Adapters are pure.** `fetch` + `map` only; no DB, no `ProjectionService`, no permission checks.
7. **`RefreshJob` is the sole refresh audit + idempotency surface.**
8. **The six identity invariants** (Volume 12 §7) — stable across all providers; merges are reversible and structural-only; merged records are never physically deleted.
9. **Surrogate-id-is-identity.** `Owner.id` / `Property.id` **is** the identity; address / APN / FIPS / provider-ids are *evidence/anchors*, never the identity. Parcel is unique only within its FIPS jurisdiction.
10. **Org-scoping by construction** and **determinism** (no `now()`/`random()` in reproducible paths; `asOf` is server-set).
11. **UI never writes projected/derived columns** — every such write flows through a domain service to the ledger.

---

## F. Entry conditions for Commit 2c (Property Identity)

> **✅ Lock complete (2026-07-15):** the fresh architecture lock this section called for has been produced and founder-approved — **[Property Identity — Architecture Lock](./PROPERTY_IDENTITY_LOCK.md)**. It resolves AD7/AD8, states initial stances on AD1/AD2/AD4, and keeps AD3/AD6 gated on Decision F. The questions below record *why* the lock was required.

**2c is materially different from 2a/2b and must NOT begin as "the next coding task."** 2a/2b extended a *proven* mechanism (projection + refresh) to a second entity. 2c introduces a *new* mechanism for that entity — **canonical identity** — where the Owner precedent is a hypothesis (B2), not a template.

A fresh **architecture lock** for 2c must resolve, at minimum:

- **Parcel/APN uniqueness scoping** — parcel is unique only *within* a FIPS jurisdiction; the identity/crosswalk model must encode jurisdiction, not treat APN as globally unique (Volume 12 §7.1).
- **Address normalization + geocode determinism** — normalization must be deterministic and versioned (like `normalizationVersion` on signals); geocode is an external, non-deterministic input and needs an explicit provenance/anchoring story.
- **External-identifier crosswalk** — whether the `OwnerExternalIdentifier` shape generalizes to Property provider-ids, or Property needs its own (B2).
- **Deterministic candidate matching** — the Owner `matchKey` + alias-overlap approach (`owner-duplicates`) does not transfer directly; Property matching is address/parcel-based. What is the deterministic, proposal-only rule?
- **Dedup/merge** — does the reversible `OwnerMergeRecord` / merge-queue pattern generalize to Property, or is Property dedup a different (or deferred) problem?
- **Licensing gate (Decision F).** Richer Property signals and any non-`USER_ENTERED` source remain **gated on founder property-source legal sign-off** (Volume 12 §8). 2c's identity work must state which parts are buildable today (surrogate identity + manual anchors) vs. blocked on licensed/public data.

**Everything in §E is off-limits to 2c** unless the 2c lock explicitly reopens it. 2c *adds* Property identity structures; it must not weaken the ledger, precedence, purity, reconstruction, or the surrogate-id philosophy to do so.

---

## G. Architectural Debt — intentionally-unresolved design questions

**Distinct from [Technical Debt (Volume 7)](../roadmap/TECHNICAL_DEBT.md).** Technical debt is a known issue or refactor in *built* code, with a fix trigger. **Architectural debt is a canonical *design* question deliberately left open** because the evidence to decide it well does not yet exist. Recording these separately makes clear they are **deferred decisions, not oversights** — nobody forgot them; the project consciously chose not to answer them prematurely. Each carries a **decision trigger** so it resurfaces at the right moment rather than by accident.

| # | Open design question | Why it is (correctly) unresolved | Decision trigger |
|---|---|---|---|
| **AD1** | Does Property ever require **structural merge** (collapsing two surrogate `Property.id`s), or does *resolve-before-create* + a crosswalk prevent duplicate surrogates from ever forming? | Owner needs merge because person records get re-created redundantly. Property has strong deterministic anchors (parcel within jurisdiction) that *may* prevent duplicates entirely — but no ingestion at volume has tested it. | First evidence of duplicate Property surrogates in real data (post-ingestion). |
| **AD2** | Should a provider-id **crosswalk replace merge** as the primary identity-reconciliation mechanism for Property? | Tightly coupled to AD1. A many-provider-ids → one-`Property.id` crosswalk may make structural merge an exceptional repair tool rather than a core workflow. | 2c identity lock (initial stance); revisit after first multi-provider ingestion. |
| **AD3** | What is the long-term **canonical address model** — deterministic in-house normalization vs. licensed CASS/USPS hygiene, and how much of an address is identity-anchor vs. pure display? | Address hygiene at real quality needs a licensed source ([Decision F](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md), Volume 12 §8). A minimal deterministic normalizer is buildable now; the full model is not. | Decision F sign-off / first licensed address source. |
| **AD4** | How is **multi-source parcel disagreement** represented and resolved (County APN vs. vendor APN for the "same" asset)? | Leaning: through the ledger + precedence, like any projected field — but the interaction between a *changing winning anchor* and *identity matching* (matching on a moving target) is unproven. | First non-manual parcel source. |
| **AD5** | When and how do **Market and Property interact** (property→market rollups; market signals influencing property scoring, Volume 12 §5–§6)? | Market is not on the spine yet; designing the interaction now would be speculative (violates B4). | The Market slice. |
| **AD6** | When does **external licensing change the architecture** itself (not just add an adapter) — e.g. a source whose terms forbid storage, mandate per-query fetch, or impose retention/attribution the ledger doesn't model? | Only `USER_ENTERED` is live; no license terms have been tested against the ledger's storage model. | First licensed-source contract review (Decision F). |
| **AD7** | Do identity **anchors live *in* the ledger** as projected fields with provenance (elegant reuse of the proven substrate), **or in a separate identity store**? | Ledger-as-anchor-store is elegant and reuses precedence/provenance — but it means identity matching runs on a *projected, possibly-changing* value. The trade-off is real and unproven. | 2c identity lock. |
| **AD8** | Is the **proposal-only, human-confirmed** identity-change discipline (proven for Owner) right for Property, given parcels are *government-assigned unique keys* far stronger than person names? Could exact `(FIPS, APN)` justify deterministic auto-anchoring? | The Owner precedent is a hypothesis, not a template (B2). Over-applying "humans confirm every identity link" may add friction where a parcel id is objectively authoritative; under-applying it may collapse distinct assets. | 2c identity lock. |

**Reading guide:** AD7 and AD8 are the two questions the **2c architecture lock resolves first** (they shape the whole identity model). AD1–AD6 are consciously **carried forward** — the 2c lock states an initial stance and a trigger for each, but does not force them closed without the evidence named above.

---

*Cross-references: design authority [Volume 12](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md) · **[Property Identity — Architecture Lock](./PROPERTY_IDENTITY_LOCK.md)** · process [Engineering Playbook](./ENGINEERING_PLAYBOOK.md) · debt [Volume 7](../roadmap/TECHNICAL_DEBT.md) · release status [Volume 1.2 roadmap](../roadmap/VERSION_1_2.md).*
