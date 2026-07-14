# Volume 12 — Commercial Intelligence Architecture

> **Release:** Version 1.2 — Commercial Intelligence · **Status:** ✅ Architecture locked (2026-07-14) · **Owner:** Engineering + Founder (data-source decisions)
> This is the **canonical design authority for Version 1.2**. Every 1.2 implementation slice references and conforms to it. It sits under [EMP Volume 2 (System Architecture)](./ENGINEERING_MASTER_PLAN.md#volume-2--system-architecture) and realizes the data half of the [Intelligence Ladder (Volume 5)](./AI_ROADMAP.md#volume-5--intelligence-roadmap).
> **Prime directive:** owner, property, market, portfolio, scoring, and refresh form **one coherent subsystem on one provenance spine** — never a collection of disconnected features.
> **Boundary:** 1.2 is **deterministic enrichment only. No AI** (AI is reserved for 2.0 and appears here only as a defined-but-unused provenance category).

## Contents
- [Intelligence Vocabulary](#intelligence-vocabulary) — canonical shared language
1. [Vision](#1-vision)
2. [Canonical Intelligence Model](#2-canonical-intelligence-model)
3. [Data Provenance](#3-data-provenance)
4. [Data Refresh Architecture](#4-data-refresh-architecture)
5. [Intelligence Scoring Framework](#5-intelligence-scoring-framework)
6. [Entity Relationships](#6-entity-relationships)
7. [Canonical Identity Strategy](#7-canonical-identity-strategy)
8. [Licensing Strategy](#8-licensing-strategy)
9. [Release Roadmap](#9-release-roadmap)
10. [Testing Strategy](#10-testing-strategy)
11. [Success Metrics](#11-success-metrics)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Locked Decisions](#13-locked-decisions)

---

## Intelligence Vocabulary

The canonical meaning of every core concept. This is the **shared language for all Version 1.2 work** — every slice, plan, test, and UI label uses these terms as defined here. If usage and this glossary disagree, fix one in the same change; never let terminology drift.

**The canonical intelligence pipeline** (each stage feeds the next; each is a distinct concept):

```
Observation  →  Signal  →  Projection  →  Score
 raw fact       accepted     operational   decision
               intelligence     model       support
```

| Term | Canonical definition |
|---|---|
| **Observation** | The **raw fact exactly as a source asserted it** — "source X reported value V for field F, as-of T, retrieved at R." The immutable, append-only capture layer and the **conceptual parent of a Signal.** Every inbound datum enters as an Observation *before* any acceptance or normalization; observations that are rejected still exist as historical record. Observations are never edited or deleted. |
| **Owner** | The **durable, canonical title-holding party** — an individual or legal entity (LLC / trust / REIT) — that owns properties and **accumulates intelligence over time**. Bears a portfolio; carries ownership signals and owner-level scores. The *primary* Commercial-Intelligence entity (Decision A). **Not** the same as a Seller. |
| **Seller** | The **transaction-specific counterparty/contact** the firm negotiates with in a deal. May *map to* an Owner (`Seller.ownerId?`) but is not the canonical title-holder and is **not enriched in place**. Unchanged from 1.0/1.1. |
| **Property** | The **physical real-estate asset**. Existing entity, enriched with structured facts (unit mix, condition, tax/assessment, prior sales). Identity-anchored by parcel/APN + jurisdiction (§7.1). |
| **Market** | The **geographic-and-asset-type context** a property sits in — a **reference entity** keyed by **county × asset type** (Decision E), carrying benchmark time-series (rent/vacancy/cap-rate) as append-only snapshots. |
| **Portfolio** | A **derived aggregation, not a primary entity.** Two senses: **Owner Portfolio** (an owner's holdings — `Owner → Property[]`, feeding distress detection) and **Firm Book** (our org's pipeline/exposure — an `Opportunity` rollup). |
| **Signal** | **Accepted intelligence** — an Observation promoted (after acceptance/normalization) into the canonical ledger (`IntelligenceSignal`, source of truth) with a full provenance envelope, then projected to typed columns for fast reads (Decision B). No signal exists without provenance. **Signals are immutable** — never edited, overwritten, or deleted; a correction is a *new* signal that marks the prior one `SUPERSEDED` (see §3). |
| **Score** | A **deterministic, versioned calculation over signals** (provenance category `CALCULATION`). Emits a **numeric value + graded band + explicit confidence** (Decision D); recomputed when inputs change; returns "insufficient data" rather than a falsely-precise number. |
| **Confidence** | A measure of trust. Always explicit, never implied — and **three independent dimensions that must not be conflated:** **Identity Confidence** (how sure we are that records represent the *same owner* — an entity-resolution property), **Owner Confidence** (how *trustworthy the owner's data* is — provenance agreement + completeness), and **Motivation Score** confidence (how sure we are of a *derived score*). Signal confidence = source + freshness (decay); score confidence = input coverage × freshness. See the separation rule in §5/§13. |
| **Refresh** | The **process of updating sourced information** — detecting staleness (`now − asOf > TTL`) and re-acquiring or recomputing. **Manual/on-demand in Slice 1; scheduled (with decay + snapshots) in Slice 6** (Decision C). |
| **Provenance** | The **mandatory metadata describing a signal's origin, freshness, and trust**: `sourceCategory`, `sourceId`, `asOf`, `retrievedAt`, `confidence`, `method`, `licenseRef?`. The spine of the whole subsystem — a fact without provenance cannot exist. |

**Three distinctions worth stating explicitly:**
- **Owner ≠ Seller.** Owner is the durable title-holder that bears a portfolio; Seller is the deal-context contact. This separation is what makes Portfolio Intelligence possible.
- **Observation ≠ Signal.** An Observation is the *raw fact as reported* (every inbound datum, accepted or not); a Signal is *accepted intelligence* in the canonical ledger. The acceptance step between them is where mandatory manual review (Decision 5/6) lives.
- **Signal ≠ Score.** A Signal is a *sourced fact*; a Score is a *deterministic derivation* over signals. Signals carry source provenance; Scores carry `CALCULATION` provenance and a version.

---

## 1. Vision

**What it is.** A layer of structured, sourced, refreshable *signal* attached to the entities the firm already works — turning "a property with an address" into "a property whose owner holds 11 assets, has held this one 14 years, and sits in a softening submarket."

**Problems it solves.**
- **Thin records.** Today a `Property` is physical facts + a price; a `Seller` is a name + a free-text `motivation` string. Underwriting and matching run on sparse inputs.
- **No owner lens.** The North Star (product framing) is *seller inventory / owner motivation*. The current model has **no owner entity** — we cannot see an owner's portfolio, hold period, or cross-property distress, the highest-leverage signal for sourcing.
- **No provenance.** We cannot say *where a fact came from, when, or how much to trust it* — disqualifying for licensed data and for any future AI.
- **No freshness.** Data silently rots; nothing distinguishes a cap rate from yesterday vs. two years ago.

**How it fits the platform.** Purely **additive and org-scoped**, riding the seams built in 1.0/1.1: Prisma Migrate (additive migrations), permissions (who sees/edits enrichment), the MessageService job pattern (reused for refresh), the telemetry/perf harness (enriched reads stay within the PQ-4 budgets), and the test pyramid. It changes **no core workflow** — enrichment *decorates* Sellers, Properties, Opportunities, and Buyers.

**Success criteria** (measurable targets in §11): every enriched field carries provenance + an as-of date; `Owner` is a first-class portfolio-bearing entity; enrichment is reproducible (golden-fixture testable); licensed/public/derived data are cleanly separated; no enriched read path regresses past its budget.

---

## 2. Canonical Intelligence Model

The intelligence domain is one graph: *new canonical entities* (`Owner`, `Market`) + *enrichment on existing entities* (`Property`, `Seller`, `Opportunity`), unified by the provenance spine (§3) and the identity strategy (§7).

| Layer | Canonical home | Nature | North-Star role |
|---|---|---|---|
| **Owner Intelligence** | **`Owner`** *(new, canonical)* | New entity + signals | **Primary** — owner motivation/portfolio is the scarce sourcing signal |
| **Property Intelligence** | Enrichment on **`Property`** | Structured asset facts | Feeds underwriting defaults |
| **Market Intelligence** | **`Market`** *(new)* = (county × asset type) | Reference entity + time-series | Value & timing context |
| **Portfolio Intelligence** | **Owner Portfolio** (derived: Owner→Property) + **Firm Book** (derived: Opportunity rollups) | Derived aggregates | Distress detection (owner) + exposure (firm) |

### The pivotal model change — Owner vs. Seller *(Decision A, locked)*
Today `Seller` conflates the title-holder with the deal contact (it directly holds `properties[]` + a free-text `motivation`). Going forward:

- **`Owner`** = the **canonical, durable identity that holds title and accumulates intelligence over time** — entity type (individual / LLC / trust / REIT), aliases/linked entities, contactability, portfolio rollups, owner-level signals & scores.
- **`Seller`** = the **transaction-specific contact / negotiating party**. Unchanged; gains an optional link to the `Owner` it represents. **Not enriched in place.**
- **`Property.ownerId?`** → current title-holder, distinct from `Property.sellerId` (deal contact).

This separation is what makes **Portfolio Intelligence possible at all**: an owner's portfolio is `Owner → Property[]`, and cross-property distress ("owner is offloading 3 of 11 assets") is unrepresentable without it. It also gives owners an **ownership history** independent of any single transaction.

*(Attributes above are conceptual domain modeling — **not schema, DDL, or migrations**, which belong to slice implementation.)*

---

## 3. Data Provenance

**Principle:** provenance is a **mandatory, first-class envelope on every enriched fact.** A field without provenance cannot exist in the intelligence layer.

**Five source categories** (closed set — mirrors 1.1's closed `MessageKind` registry discipline):

| Category | Meaning | Redistribution | Trust default |
|---|---|---|---|
| `USER_ENTERED` | A team member typed it | Firm-owned | As entered |
| `LICENSED` | Paid provider under contract | **Restricted by license** | Provider-stated |
| `PUBLIC` | Open/government/public record | Generally free | Source-dependent |
| `CALCULATION` | Deterministic internal derivation | Firm-owned | Function of inputs |
| `AI_DERIVED` | *Reserved for 2.0 — defined, unused in 1.2* | Firm-owned, flagged | Model confidence |

**Envelope** (per field or coherent field-group): `sourceCategory`, `sourceId`, `asOf`, `retrievedAt`, `confidence`, `method`, `licenseRef?`.

**Version stamping.** Every observation and signal also records a **`schemaVersion` / `normalizationVersion` / `projectionVersion`** triple, so a later change to record format, normalization logic, or projection rules is **reproducible and migratable without ambiguity** — you can tell exactly which rules produced any historical value.

### The immutability invariant *(locked — canonical)*
**The ledger is immutable. It records history the way Git does.** Once written, an **Observation and a Signal are never edited, overwritten, or deleted** — the only permitted state transition is **`SUPERSEDED`**. A correction, a re-fetch, or a user override is always a **new** ledger row that supersedes the prior one; the prior row stays, forever, as the record of what was believed and when. **The projection changes; the ledger never does.** This makes provenance total: every value the system ever showed is reconstructable and explicable, which is the foundation for licensed-data defensibility and (later) AI auditability.

### Storage — hybrid model *(Decision B, locked)*
- **Two-layer append-only ledger.** **Observations** capture every raw inbound assertion (the parent layer); **Signals** are the accepted intelligence promoted from observations. Both are append-only and immutable (above). Acceptance — including mandatory manual review (Decisions 5/6) — is the gate between them.
- **Typed projections** — high-value, stable fields live as typed columns on the entity for fast operational reads (protects the board/record perf budgets).
- The typed column is a **denormalized projection of the latest accepted, non-superseded signal** — the same source-of-truth → projection pattern as the 1.1 EmailMessage outbox, and always **rebuildable from the ledger** (a tested invariant).

**Grain:** per-field for user edits and calculations; per-field-group for coherent bundles (e.g. a contact record) and licensed/public bulk imports. Every value is explainable; every value is refreshable.

**Surfacing:** every enriched value in the UI shows source badge, as-of date, confidence, and (for licensed) attribution. No naked numbers.

---

## 4. Data Refresh Architecture

Enrichment is a **living** dataset. **Walking-skeleton delivery** *(Decision C, locked)*: Slice 1 ships the interfaces + **manual/on-demand refresh only**; Slice 6 automates scheduling, decay, and snapshots.

- **Cadence — per source category.** `USER_ENTERED`: never auto-refreshes. `LICENSED`/`PUBLIC`: TTL per provider/contract. `CALCULATION`: recomputes on input change (event-driven), not on a clock.
- **Stale detection.** Stale when `now − asOf > TTL(sourceCategory, sourceId)`. Computed, surfaced, drives scheduling — never hidden. *(Available from Slice 1; drives manual refresh prompts.)*
- **Refresh scheduling (Slice 6).** A **Refresh Engine** built on the **existing MessageService job/drain pattern** — durable queue + worker + per-kind retry — not a new framework. On the single VPS it runs as a scheduled drain (cron/systemd timer, the backup D4 seam). Jobs are idempotent and org-scoped.
- **Historical snapshots (Slice 6).** Time-varying signals (market trends, owner portfolio size, cap-rate benchmarks) are **append-only, `asOf`-stamped snapshots** — never overwrites. Enables trend lines, "value at time of deal," and audit. Point-in-time reads project the latest snapshot.
- **Confidence decay (Slice 6).** `effectiveConfidence = statedConfidence × decay(now − asOf)`, with a **decay curve per source category** (licensed cap rates decay faster than a recorded year-built, which never decays). Deterministic and testable.

---

## 5. Intelligence Scoring Framework

**Philosophy.** A score is a **deterministic, versioned, `CALCULATION`-provenance projection** over enrichment inputs. Every score is reproducible; declares its inputs; emits **a numeric value, a graded band, and an explicit confidence** *(Decision D, locked)*; is recomputed when inputs change; and is **versioned** (the DealAnalysis-scenario / `templateVersion` pattern) so historical scores stay explicable. **No formulas in this architecture** — only the contract. Each score's formula is a **later, per-score locked decision** (target: 1.2 Slice 5, with worked examples).

| Score | Purpose | Inputs | Output | Confidence driver |
|---|---|---|---|---|
| **Owner Motivation** | Likelihood this owner sells | hold period, portfolio churn, distress, life/tax events | value + band + confidence | owner-signal coverage & freshness |
| **Owner Confidence** | Reliability/contactability of our owner data | contactability, source agreement, completeness | value + band + confidence | provenance agreement across sources |
| **Property Opportunity** | Attractiveness to pursue | property facts, market context, price vs. benchmark | value + band + confidence | property + market coverage |
| **Market Strength** | Submarket health/direction | rent/vacancy/cap-rate trends | value + band + confidence | snapshot recency + series depth |
| **Portfolio Risk** *(firm)* | Concentration/exposure in our book | firm-book rollups by market/asset/source | value + band + confidence | pipeline completeness |
| **Portfolio Opportunity** *(owner)* | Upside across an owner's holdings | owner-portfolio rollups + per-property opportunity | value + band + confidence | owner-portfolio coverage |

**Contract rules:** scores never store raw licensed data (they *reference* it via the ledger, never republish); a score with insufficient input coverage returns **"insufficient data"** — never a falsely-precise number; every score is unit-testable with worked examples, branch-gated like the 1.1 critical modules.

---

## 6. Entity Relationships

Nothing in the intelligence domain exists outside this graph. (*existing* = current entities; **new** = introduced in 1.2.)

```
Organization ──< everything (org-scoped, cascade) >───────────────────────────

Owner (new) ──owns──< Property (existing, enriched)
   │                      │
   │                      ├─ marketId? ──> Market (new) ──< MarketSnapshot (new, append-only)
   │                      └─ sellerId?  ──> Seller (existing)
   │
   ├─mapsTo──< Seller (existing)          Seller ──< Opportunity (existing)
   │                                                    │
   └─(derived) Owner Portfolio            Opportunity ──┼─ propertyId ──> Property
                                                        ├─ sellerId    ──> Seller
                                                        ├─ DealAnalysis (existing)
                                                        └─ BuyerMatch ──> Buyer (existing)

IntelligenceSignal (new, provenance ledger) ──references──> {Owner | Property | Market}
ExternalIdentifier (new, crosswalk) ──────maps provider ids──> {Owner | Property | Market}
RefreshJob (new) ──targets──> {Owner | Property | Market} signals
Firm Book (derived) ──aggregates──> Opportunity / DealAnalysis
```

**Rules:**
- **Owner ↔ Property:** one-to-many (`Property.ownerId?`); the owner's portfolio is this set. Nullable — additive; unlinked properties still work.
- **Owner ↔ Seller:** `Seller.ownerId?` — a seller contact represents one owner; an owner may surface through several seller contacts over time.
- **Property ↔ Market:** many-to-one; Market is a shared org reference keyed by (county × asset type).
- **Market ↔ MarketSnapshot:** one-to-many append-only time-series.
- **IntelligenceSignal / ExternalIdentifier:** polymorphic references to Owner/Property/Market — the universal provenance carrier and identity crosswalk (§7).
- **Buyer / DealAnalysis / Opportunity:** unchanged; they *consume* intelligence (matching gains owner+market context; underwriting gains property+market defaults) with no structural change in 1.2.

---

## 7. Canonical Identity Strategy

**Requirement (founder-mandated, pre-Slice-1):** every canonical entity needs an identity that stays **stable across multiple, changing data providers**, so enrichment, deduplication, and cross-provider matching have a durable backbone. This section defines that strategy for **Owner, Property, and Market** — it must be locked before Slice 1 planning.

### Shared identity architecture (all three entities)
Three layers per entity:
1. **Surrogate id** — internal, opaque, stable primary key (`cuid`, as today). **Never changes, never provider-derived.** Every FK in the graph points here. This is the backbone.
2. **Canonical match key** — a normalized natural key derived from **durable, provider-independent anchors** (government codes, physical anchors), used for **deduplication** and to decide when two inbound records are the same real-world thing.
3. **External identifier crosswalk** (`ExternalIdentifier`: entity ref + `provider` + provider's native id + `asOf`) — so the same real-world entity from provider X and provider Y **resolves to one surrogate**. Adding a provider never disturbs the surrogate or the graph.

**ExternalIdentifier immutability *(invariant, locked)*.** A crosswalk row, once written, is **never edited, reassigned, or deleted.** If a mapping changes, a **new row** is created; the old one remains as permanent history. This gives a total audit trail of provider→owner mappings over time and forecloses a class of subtle identity bugs (a silently-repointed id). Like the signal ledger (§3), the crosswalk is append-only.

Cross-cutting rules: canonical keys **never** use a provider's internal id as the primary basis; identity resolution is **revisable and auditable** (merges/splits recorded via provenance); crosswalk rows are **immutable**; all identity operations are org-scoped.

### The six identity invariants *(non-negotiable — stable across all providers)*
These define the behavior of the identity subsystem and **do not change** regardless of future provider integrations, scoring, or AI. Every identity slice (1a, 1a-2, and beyond) upholds all six:

1. **ExternalIdentifier is authoritative.** Only an `ExternalIdentifier` match — or explicit manual confirmation — establishes or links a canonical identity.
2. **Normalized names produce candidate matches only.** A name/alias match is a *proposal*, never an identity.
3. **No automatic canonical identity creation.** The system never promotes a candidate to a canonical link on its own.
4. **No automatic merges.** Merges happen only by explicit human action (mandatory review); never inferred.
5. **ExternalIdentifier rows are immutable.** Never edited, reassigned, or deleted — a changed mapping is a new row; old rows are permanent history.
6. **Identity operations are fully auditable and reversible.** Every link/accept/reject/merge/unmerge is recorded (actor, time, cause) and can be undone with no data loss.

### 7.1 PropertyIdentity
- **Canonical match key:** `(jurisdiction FIPS + APN/parcel number)` when available — the most stable real-world anchor — else `(normalized address + geocode lat/long)`.
- **Anchors:** APN/parcel, county FIPS, normalized USPS address, geocode. All provider-independent.
- **Resolution:** parcel+FIPS is near-unique; address/geocode is the fallback with a normalization + proximity match. Multiple provider parcel ids map via the crosswalk.

### 7.2 OwnerIdentity *(the hard case — entity resolution, not a single key)*
Owners are messy: legal entities (LLCs/trusts) and individuals, with aliases, name changes, and layered ownership. There is **no single natural key**, so OwnerIdentity is designed as a **resolvable, mergeable identity**:
- **Match signals** (not one key): normalized entity/individual name, registered agent, mailing address, jurisdiction of registration, linked entity registrations, and tax id **only where a licensed lane + legal sign-off permit** (PII boundary — §8).
- **Resolution *(authority rule, locked — S1-4)*:** an **`ExternalIdentifier` match — or explicit manual confirmation — is the only thing that establishes or links a canonical identity.** Normalized-name/alias matches are **candidate records only**; they never auto-link and never auto-merge. A deterministic step proposes candidates with a confidence; a human accepts or rejects (mandatory review, S1-5). The surrogate is authoritative. **Owners may be merged only by explicit action**, and every merge is **reversible and provenance-audited** (what drove it, when, by whom) via an `OwnerMergeRecord` carrying a typed `mergeReason` (`DUPLICATE_IMPORT` · `MANUAL_DUPLICATE` · `PROVIDER_RECONCILIATION` · `ALIAS_CONSOLIDATION` · `OTHER`). Merge is **structural only** (see the invariant in §13): it repoints operational links and tombstones the loser (`mergedIntoId`), but never moves immutable identity rows (external ids stay on the loser; resolution follows the chain) and never reconciles business data.
- **Design consequence:** Slice 1 must include a minimal, deterministic owner-resolution + merge capability — not just an `Owner` table. This is the single most complex identity, and it is the North-Star entity, so it is built first and carefully.

### 7.3 MarketIdentity *(the clean case)*
- **Canonical match key:** `(county FIPS + AssetType enum)` — a fully deterministic composite of a stable government code and an existing enum. Provider-independent by construction.
- **Extensible:** the grain code is a field, so a finer grain (ZIP, metro, custom submarket polygon) can be added later **without** remodeling — the surrogate and (FIPS, assetType) rows remain valid as a coarser rollup.

---

## 8. Licensing Strategy

Mirrors the DealFlow **"clean lane"** discipline: **the binding constraint is legal, not technical.** Provenance categories (§3) are the enforcement mechanism; **founder sign-off per source precedes each slice** *(Decision F sequence: Owner → Property → Market)*.

| Lane | Storage rule | Redistribution | UI |
|---|---|---|---|
| **Licensed** | `licenseRef` + provider ToS captured, TTL enforced by refresh | **Blocked from exports/reports unless the license permits**; attribution mandatory | Badged, attributed |
| **Public** | Source citation stored | Generally free; still cited | Badged |
| **Derived** (`CALCULATION`) | Firm-owned | Freely usable | Shown as "computed" |
| **AI** *(2.0)* | Reserved; flagged & reviewable | Firm-owned, disclosed | *(future)* |

**Enforced boundaries:**
- **No commingling.** Licensed raw values never silently flow into an exportable/derived surface. A derived score may *reference* licensed inputs via the ledger but does not *republish* them.
- **Per-provider limits** (seat/volume/retention/redistribution) captured as machine-readable policy on `sourceId`; the refresh engine and export paths honor them.
- **Contactability / PII boundary.** Owner contact enrichment respects the public-vs-skip-trace line from the DealFlow FSBO/probate analysis: public contact is fair game; skip-trace/PII requires an explicit **licensed lane + legal sign-off.**

---

## 9. Release Roadmap

Every slice is independently reviewable, no larger than a 1.1 slice, and follows the full lifecycle (plan → branch → implement → verify → commit → review → merge). The order front-loads the **shared spine** so every later layer reuses it.

| Slice | Name | Delivers | Depends on |
|---|---|---|---|
| **1** | **Intelligence Spine + Owner foundation** | `Owner` entity + **identity/resolution/merge (§7.2)**, provenance ledger (§3), `ExternalIdentifier` crosswalk, on-demand refresh interface (§4 minimal), one deterministic Owner enrichment lane, org-scope + permissions | Owner source sign-off (F) |
| **2** | **Property Intelligence** | Property signal set (unit mix, condition, tax/assessment, prior sales) + PropertyIdentity (§7.1) on the spine | Slice 1, Property source sign-off |
| **3** | **Market Intelligence** | `Market` + `MarketSnapshot` time-series + MarketIdentity (§7.3); Property↔Market link | Slice 1, Market source sign-off |
| **4** | **Portfolio Intelligence** | Owner Portfolio rollups + Firm Book org rollups (extends the dashboard) | Slices 1–3 |
| **5** | **Cross-entity scoring** | Scoring framework + the six scores (§5), versioned, value+band+confidence | Slices 1–4 |
| **6** | **Refresh engine** | Scheduled drain, stale detection, snapshots, confidence decay (automates Slice 1's interface) | Slices 1–3 |
| **7** | **UI integration** | Provenance surfacing, score display, enrichment on record pages — perf-budgeted | Slices 1–6 |

**Carried from 1.1 (independent; sequence flexibly — do not block intelligence work):**
- **Slice 3e — Password Reset** (self-serve reset on the MessageService platform; closes Tech-Debt [D10](./TECHNICAL_DEBT.md)).
- **Relation search** (Better Lists: seller/property/owner filters — best *after* Slice 1 lands `Owner`).

---

## 10. Testing Strategy

Extends the existing pyramid (unit `node:test`/tsx + E2E on the guarded `_test` DB + perf harness):
- **Deterministic enrichment → golden fixtures.** Fixed input dataset → exact expected enriched output; re-running must be byte-stable (the definition of "deterministic"). Regression-locks every importer/join.
- **Identity → resolution & merge tests.** PropertyIdentity dedup on parcel/address; OwnerIdentity resolution + **reversible merge** provenance; MarketIdentity deterministic key. Crosswalk maps multi-provider ids to one surrogate.
- **Provenance → invariant tests.** Every enriched field **must** carry a valid provenance record with `asOf`; a fact without provenance fails. Licensed fields must carry `licenseRef`.
- **Scoring → worked-example unit tests.** Fixed inputs → expected value + band + confidence, including the **"insufficient data"** path. Branch-gated.
- **Refresh → stale/decay/snapshot tests.** TTL-boundary stale detection; decay values at chosen ages; append-only snapshots never overwrite; idempotent re-runs.
- **Org-scope E2E.** Every new entity (Owner, Market, IntelligenceSignal, ExternalIdentifier, RefreshJob) gets a cross-org isolation test (enforces [D2](./TECHNICAL_DEBT.md)).
- **Performance.** Enriched read paths measured on `perf:measure` against a seeded enriched dataset; **the board and record pages must stay within their PQ-4 budgets** — enrichment joins may not silently regress hot paths.

---

## 11. Success Metrics

1.2 is deterministic, so "accuracy" means **validity/consistency vs. a labeled sample**, not model accuracy. Targets locked with the founder per layer.

| Metric | Definition | Direction |
|---|---|---|
| **Coverage** | % of Owners/Properties/Markets with each enrichment layer populated | ↑ |
| **Refresh latency** | time from due-for-refresh → refreshed | ↓ |
| **Freshness** | median `asOf` age per source category vs. its TTL | within TTL |
| **Confidence** | distribution of effective confidence across enriched fields | ↑, honest |
| **Completeness** | % of required field-groups present per entity | ↑ |
| **Identity precision** | dedup correctness on a labeled match sample (esp. Owner) | ↑ |
| **Scoring validity** | agreement with a human-labeled validation sample | ↑ |
| **Perf guardrail** | enriched board/record p95 vs. budget | **within budget** |

---

## 12. Risks & Mitigations

| Domain | Risk | Mitigation |
|---|---|---|
| **Technical** | Owner/Seller remodel churns schema; enrichment N+1s bloat hot paths; ledger/snapshot growth; **owner entity-resolution is hard** | Additive-only migrations; `Owner`/`ownerId` nullable so nothing breaks; PQ-4 `select` discipline + perf gate; ledger indexed/archivable; deterministic + **reversible** owner merges with provenance |
| **Licensing** | ToS violation, redistribution, commingling licensed data into exports | Provenance lanes; `licenseRef` policy on `sourceId`; export paths honor per-provider limits; **founder legal sign-off per source before its slice** |
| **Performance** | Enrichment joins regress the just-optimized board / record pages; refresh load on single VPS | Enriched reads measured pre-merge vs. budget; refresh runs off-peak as a drain; batch + idempotent jobs |
| **Operational** | Refresh scheduling on single host; provider outages; API-key management | Reuse backup-style cron/timer seam (D4); jobs retry (MessageService pattern); keys via fail-fast `lib/env.ts` |
| **Legal / PII** | Owner contactability crosses skip-trace/PII line | Public-vs-licensed contact split (DealFlow FSBO/probate precedent); PII only via explicit licensed lane + sign-off |
| **Scope** | Layers drift into disconnected features; AI creeps in early | This document is the single canonical model; **no AI in 1.2**; every slice references Volume 12 |

---

## 13. Locked Decisions

Locked 2026-07-14. These are binding for all 1.2 work; changing one requires an ADR-style note here before a dependent slice proceeds.

| # | Decision | Resolution |
|---|---|---|
| **A** | Owner model | **New first-class `Owner` entity.** Owner = canonical, durable title-holder that accumulates intelligence; Seller = transaction counterparty. **Do not enrich Seller in place.** |
| **B** | Provenance | **Hybrid** — typed projections (fast reads) + provenance ledger (`IntelligenceSignal`, source of truth). |
| **C** | Refresh | **Walking-skeleton.** Slice 1: manual/on-demand refresh + interfaces. Slice 6: scheduled engine, decay, snapshots. |
| **D** | Scores | Every score = **numeric value + graded band + explicit confidence.** |
| **E** | Market grain | **County × asset type** (FIPS-based); finer grains addable later without remodel. |
| **F** | Source sequence | **Owner → Property → Market**; founder legal sign-off precedes each slice. |
| **+** | Canonical identity | Surrogate id (backbone) + canonical match key (durable anchors) + `ExternalIdentifier` crosswalk, for **Owner / Property / Market** (§7); provider-stable, resolution auditable. |

### Canonical invariants (locked 2026-07-14)
- **Ledger immutability.** Observations and Signals are never edited, overwritten, or deleted — only `SUPERSEDED`. The projection changes; the ledger never does (§3). Git-like history.
- **Observations are immutable even if rejected.** A rejected observation is never discarded — it persists **permanently**, explaining *why* something was not accepted into the intelligence layer. Rejected observations are as valuable for audit and review as accepted ones.
- **Complete lineage.** Every Signal references **exactly one** originating Observation (`observationId`). No signal can exist that cannot be traced back to the raw fact it came from — `Observation → Signal → Projection → Score` is unbroken end to end.
- **Projections are disposable.** The ledger is the sole source of truth; a projection (typed column) is a **cache that must be fully rebuildable from the ledger** and is never authoritative. If a projection and the ledger disagree, the ledger wins and the projection is rebuilt. This is what makes the operational read model safe to drop, recompute, or re-shape at any time.
- **ExternalIdentifier immutability.** Crosswalk rows are never edited, reassigned, or deleted — a changed mapping is a **new** row; old rows are permanent history (§7). Append-only, like the ledger.
- **Intelligence pipeline.** `Observation → Signal → Projection → Score` (raw fact → accepted intelligence → operational model → decision support). Observation is the immutable raw-capture parent of Signal (Vocabulary).
- **Identity authority.** An `ExternalIdentifier` match (or explicit manual confirmation) is the **only** thing that establishes/links a canonical identity. Normalized-name matches produce **candidate records only — never a canonical identity, never an automatic merge** (§7.2).
- **Confidence separation.** **Identity Confidence** (same-owner?), **Owner Confidence** (data trustworthiness), and **Motivation Score** (likelihood to transact) are **independent dimensions** — never collapsed into one number. Identity resolution, data quality, and behavioral prediction are distinct concerns.
- **Merge is structural only.** A merge changes only graph *structure* — repointed operational links (`Property.ownerId`/`Seller.ownerId`) and a tombstone (`mergedIntoId`). It **must never reconcile business data**: not contacts, notes, intelligence, provenance, scores, or any scalar business field. Field-level reconciliation belongs to the ledger/projection era (1b+). This keeps merge deterministic, reversible, and easy to test.
- **Merged owners are never physically deleted.** `MERGED` is a **permanent lifecycle state** — the tombstone owner, its historical merge records, its external identifiers, and its audit events are **never removed**. The identity layer is fully reconstructable at any point in time, which is what makes it legally defensible and unmerge lossless. (The only removal path is org deletion, which cascades the whole tenant.)

### Slice 1 founder decisions (locked 2026-07-14)
| # | Decision | Resolution |
|---|---|---|
| **S1-1** | First enrichment lane | **`USER_ENTERED` only.** No public, no licensed, no provider integration in Slice 1 — the objective is proving the spine, not acquiring data. |
| **S1-2** | Licensed retention/redistribution policy | **Deferred** until the first licensed provider exists. |
| **S1-3** | Owner entity types | `INDIVIDUAL, LLC, TRUST, CORPORATION, PARTNERSHIP, REIT, GOVERNMENT, OTHER, UNKNOWN`. |
| **S1-4** | Identity threshold | **`ExternalIdentifier` is authoritative.** Normalized names create candidate matches only, never canonical identities. |
| **S1-5** | Ambiguous matches | **Mandatory manual review. No automatic merges anywhere in 1.2.** |
| **S1-6** | User overrides | **Sticky pins** — a user override is never silently overwritten by provider updates; only explicit user action removes the pin. |
| **S1-7** | CSV import | **Deferred** — do not let ingestion distract from proving the architecture. |

**Next step:** Commit 1a planning (Owner + identity schema foundation) — **planning only.** No implementation until 1a is planned, approved, and run under the standard lifecycle.
