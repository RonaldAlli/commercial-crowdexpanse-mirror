# Property Identity — Architecture Lock

> **Status:** 🔒 **LOCKED 2026-07-15** (founder-approved with refinements to PI-E and PI-G). Binding for **Slice 2 Commit 2c** and all later Property identity work.
>
> **Authority:** this document is the detailed lock for **Property canonical identity**. It *extends* [Volume 12 §7.1 (PropertyIdentity)](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md#71-propertyidentity) and is **subordinate to** Volume 12's canonical invariants (§13) and the six identity invariants (§7), plus the frozen invariants in the [V1.2 Midpoint Architecture Status §E](./V1_2_ARCHITECTURE_STATUS.md). Nothing here weakens the ledger, precedence, projection purity, reconstruction, or the surrogate-id philosophy.
>
> **Why a fresh lock:** Slice 2 Commits 2a/2b *extended a proven mechanism* (projection + refresh) to a second entity. 2c introduces a **new mechanism for that entity — canonical identity** — where the Owner precedent is a *hypothesis, not a template* (Midpoint §B2). This lock records the decisions that make Property identity a first-class design in its own right.

---

## 1. Reframe — Property identity is spatial/parcel resolution, not name resolution

Owner identity resolves **legal persons**: names are fuzzy, alias-heavy, never authoritative → *fuzzy candidate review + reversible structural merge*, auto-anchoring nothing (Volume 12 §7.2). Property identity resolves a **physical asset** that carries **government-assigned quasi-keys** — a parcel number (APN) authoritative *within its jurisdiction*, a normalizable postal address, and (later) a geocode.

That difference is the whole design: Property leans on **strong deterministic anchors + an immutable crosswalk + resolve-before-create**, not on fuzzy matching + merge. **But a government parcel id is strong *evidence*, not proof of identity** — data-entry error, county reassessment, and parcel split/renumber all mean the key is not infallible. Deterministic resolution is therefore **guarded** (unique + conflict-free), never unconditional.

---

## 2. The model

- **Anchor values** — `apnNormalized`, `countyFipsCode`, `addressNormalized` (and, later, geocode) — ride the **existing `Observation → Signal → Projection` ledger** as projected fields with provenance. Multi-source disagreement and precedence are handled by the proven substrate; **no new disagreement mechanism** is introduced.
- **Derived identity surface** — a thin, indexed **`PropertyIdentity`** layer plus an immutable **`PropertyExternalIdentifier`** crosswalk (`(organizationId, provider, providerIdentifier) → Property.id`). This surface **accelerates matching and resolve-before-create but is not an independent source of truth**: it is *derived and rebuildable* from the canonical `Property`, the accepted ledger evidence, and the immutable crosswalk records.

---

## 3. Locked decisions (PI-A … PI-H)

| # | Decision | Locked resolution |
|---|---|---|
| **PI-A** | **Hybrid identity model** | Canonical anchors remain **ledger-backed projected facts with provenance**. `PropertyIdentity` + `PropertyExternalIdentifier` are an **indexed resolution surface, not independent canonical truth**. **Invariant:** the identity index is **derived and rebuildable** from the canonical `Property`, accepted ledger evidence, and immutable external-identifier crosswalk records. **No unreconstructable second identity store.** |
| **PI-B** | **Parcel anchor** | Strong parcel key = **`countyFipsCode` + `apnNormalized`** — *never APN alone*. Normalization is **deterministic and versioned**; the **raw submitted APN is preserved in provenance** (never discard punctuation/formatting without retaining the raw value); jurisdiction agreement is required for a parcel match. |
| **PI-C** | **Address normalization** | **Minimal deterministic normalizer only:** case + whitespace, directional tokens, street-suffix standardization, unit extraction/normalization, postal-code normalization. Output is **candidate evidence, not certified deliverability** and not the Property identity. **CASS/USPS-grade hygiene is gated on an approved external source.** |
| **PI-D** | **Geocode** | **Excluded from the 2c skeleton.** When later introduced it must carry provider/source, coordinates, precision/match-level, `asOf`, `adapterVersion`, and the original address input — and remains **source-attributed proposal evidence, never the canonical identity key.** |
| **PI-E** | **Matching discipline** | **Guarded, tiered `deterministic resolve-before-create`** (see §4) — **not** unconditional parcel attachment. An exact parcel match resolves automatically only when unique and conflict-free; otherwise it becomes a review candidate. Resolve-before-create **prevents duplicate creation; it does not change the surrogate identity and does not merge.** |
| **PI-F** | **Merge vs. crosswalk** | **Crosswalk-first.** **No structural Property merge in 2c.** Use resolve-before-create + immutable provider crosswalks + candidate review for ambiguity. Property merge is **carried Architectural Debt (AD1/AD2)**; **trigger:** real production evidence of duplicate canonical surrogates that cannot be corrected safely through resolution or crosswalk reassignment. |
| **PI-G** | **Multi-source disagreement** | Projection determines the **displayed** current canonical anchor, **but identity resolution must also inspect whether conflicting active strong-anchor evidence exists.** No conflict → the winning parcel projection may participate in Tier 1A. Conflict → **automatic resolution is blocked and a review candidate is created.** All competing evidence stays immutable in the ledger; a change to the winning anchor **deterministically rebuilds** the identity index. **Precedence must never hide an identity conflict.** |
| **PI-H** | **Scope** | **Headless-first, then UI** (see §6 sub-commits). External parcel ingestion, licensed/public sources, geocoding, richer enrichment, fuzzy matching, and structural Property merge remain **separately gated.** |

### 3.1 Implementation decisions (locked 2026-07-15)

| # | Decision | Locked resolution |
|---|---|---|
| **ID-1** | **RBAC resource** | A **dedicated `PROPERTY_IDENTITY` resource**, high-risk posture mirroring `OWNER_IDENTITY`: **write/manage = ADMIN + ACQUISITIONS; no ANALYST/DISPOSITIONS read tier** for the resolution surface; enforced at **both page and action** layers; **denials audited**. Ordinary `PROPERTY` write does **not** govern canonical-identity decisions. Property CRUD/provenance/refresh keep their existing resources; structural merge stays separate (out of 2c). |
| **ID-2** | **Typed projected-field model** | Generalize the Property projected-field definition to **one small, explicit typed field-definition map**: `{ key, valueType (integer \| string-anchor), normalizer, projection coercion }`. **No** dynamic-field framework, plugin registration, runtime-configurable schema, or second anchor-projection path. Raw values stay in `Observation` provenance; normalized values are deterministic + versioned. **The entity registry stays dispatch-only**; Property-specific normalization/projection stays in Property intelligence modules. |
| **ID-3** | **Candidate store** | A **dedicated `PropertyMatchDecision`**; do **not** generalize `OwnerMatchDecision` in 2c. The two domains share the *review concept* but use materially different evidence (Owner: names/aliases/matchKey · Property: FIPS-scoped parcel anchors/normalized address/crosswalk conflicts). Revisit a shared abstraction only once both are proven and their persistence/lifecycle shapes are demonstrably identical. |

### 3.2 2c-i refinements (locked 2026-07-15)

| # | Refinement | Locked resolution |
|---|---|---|
| **R1** | **Derived-index watermark** | `PropertyIdentity` carries **`rebuiltFromProjectionAt`** — the **deterministic projection-state watermark** the row reflects (the max `createdAt` of the winning anchor signals it was derived from; null if none). **Not wall-clock** — this keeps the whole row a pure function of the ledger, so it satisfies R2 and the zero-write rebuild (R4). Index/projection drift is detectable by comparing this watermark against the current winning-signal watermark. |
| **R2** | **Deterministic identity derivation *(new invariant)*** | A rebuild from the same `Property` + accepted ledger + crosswalk produces **byte-for-byte identical** `PropertyIdentity` (anchors + `parcelKey` + `rebuiltFromProjectionAt`). Not "equivalent" — *identical*. Crosswalk history is append-only (R3). |
| **R3** | **Crosswalk: superseded, never rewritten** | `PropertyExternalIdentifier` mirrors the Signal model: rows are **never edited or deleted**; a remapping **supersedes** the prior row (`state ACTIVE → SUPERSEDED`, `supersededById`) and **inserts a new ACTIVE row** — full history retained. **At most one ACTIVE** row per `(organizationId, provider, providerIdentifier)`, enforced transactionally (as the signal lineage head is). A move is an explicit, audited supersession — never a silent repoint (invariant #6). |
| **R4** | **Idempotent rebuild *(test)*** | The derived surface is content-idempotent: a **second consecutive `rebuildPropertyIdentity` performs zero writes**. Proven by an executable E2E (Projection → rebuild → rebuild; assert the second is a no-op). |
| **R5** | **Deterministic identity fingerprint** | `PropertyIdentity` carries **`identityVersion`** — a **deterministic fingerprint** (sha256 of the winning anchor set + normalizer versions + the algorithm version, R6), **not a timestamp, not random, not a sequence**. It lets a consumer detect a **semantic identity change** without diffing the row; it is a pure function of the ledger (rebuildable, part of R2's byte-for-byte identical row). Operational rebuild *timing*, if ever needed, is recorded **separately** — never in the canonical derived identity. Proven by the identity-evolution E2E (anchor supersession flips the fingerprint; reconstruction stays deterministic; the crosswalk is untouched; rebuild reconverges to zero writes). |
| **R6** | **Explicit identity algorithm version** | The fingerprint (R5) derives from an explicit **`IDENTITY_ALGORITHM_VERSION`** *plus* the winning anchor set *plus* the anchor normalizer versions. Making the derivation **algorithm** a first-class versioned concept (distinct from the normalizer versions) lets the system distinguish three independent kinds of change **without compromising determinism**: **different evidence** (anchors changed) · **different normalization** (a normalizer version changed) · **different algorithm** (this version changed). A bump to any one flips the fingerprint deterministically; identical evidence under the same algorithm + normalizers keeps it. |

### 3.3 2c-ii refinements (Resolution layer, locked 2026-07-15)

Resolution is the layer that decides **how new evidence attaches** to a canonical Property — a deterministic classification engine between identity structure (2c-i) and human governance (2c-iii). It is **not** a workflow.

| # | Refinement | Locked resolution |
|---|---|---|
| **RES-1** | **Classification is pure** | The classifier is a pure function of `(evidence, lookup results)`: **no DB, no clock, no randomness, no writes, no side effects**. Identical evidence + identical lookup state ⇒ identical outcome. All DB effects live in the orchestrator around it, so classification is independently testable and reusable. |
| **RES-2** | **Deterministic resolution sequence** | Every resolution follows the fixed order **Normalize → Lookup → Conflict Inspection → Classification → Decision → Attachment → Audit → Candidate → Rebuild**. Attachment never precedes classification; audit never precedes decision. Future implementations preserve this ordering unless an explicit architectural review changes it. |
| **RES-3** | **Resolution basis** | Every `PropertyResolution` and `PropertyMatchDecision` records a deterministic `basis` (`UNIQUE_PARCEL`, `UNIQUE_EXTERNAL_IDENTIFIER`, `PARCEL_CONFLICT`, `ADDRESS_PROPOSAL`, `EXTERNAL_ID_CONFLICT`) — explanatory metadata answering *why this path*, **never an input to behavior** and never a score/confidence. |
| **RES-4** | **Authority hierarchy** | Authoritative anchors = the parcel key `(FIPS, APN)` and an external identifier; a normalized address is weak. An external identifier participates in Tier 1A only as a **single, conflict-free** authoritative match — a conflicting parcel or conflicting active external mapping downgrades to 1B (**an authoritative anchor, not an override** of conflicting authoritative evidence). A weak address disagreement never blocks Tier 1A on its own; it downgrades only when it introduces **another authoritative** candidate. Hierarchy: **parcel ↓ external identifier ↓ address.** |
| **RES-5** | **Resolution never modifies evidence** | Resolution only **appends** (crosswalk rows, enrichment observations retaining their original source metadata, audit + candidate rows) and **deterministically rebuilds** the identity index. Observations, Signals, Projections, and Identity remain immutable or deterministically rebuildable; resolution only determines **where new evidence attaches**, never rewriting historical evidence. |
| **RES-6** | **Resolution replay is deterministic *(new invariant)*** | Given identical `requestKey` + evidence + lookup state, the engine produces identical results: the same target `Property`, the same `ResolutionBasis`, the same audit record, and the same candidate state. **Replay correctness is stronger than duplicate suppression** — a replay is not merely "no second row," it is the same deterministic outcome. |
| **RES-7** | **Reversal never rewrites classification history *(new invariant)*** | A reversal **appends** a `REVERSAL` event (actor + reason + affected resolution) and revokes the crosswalk attachments it made (`ACTIVE → SUPERSEDED` via `revokedByResolutionId`). It **never mutates or deletes** the original `RESOLVE` event or its `basis`. The historical classification remains true; only its operational effect changes — the record reads "this deterministic resolution was later reversed." |

---

## 4. The guarded tiered resolution rule (PI-E, refined)

| Tier | Trigger | Behavior |
|---|---|---|
| **1A** | Exact `(countyFipsCode, apnNormalized)` match **and all guards hold** | **Deterministic resolve-before-create** → resolve to the existing `Property`. |
| **1B** | Exact parcel anchor but **multiple matches, conflicting strong-anchor evidence, or a conflicting crosswalk mapping** | **Human-review candidate.** |
| **2** | Exact **normalized address within the same jurisdiction**, no reliable parcel anchor | **Proposal-only** (human confirms). |
| **3** | Fuzzy address / geospatial proximity | **Deferred** (needs geocode; Decision F). |

**Tier 1A guards — all must hold, else drop to Tier 1B:**
1. Exactly **one active canonical Property** matches.
2. The **organization matches**.
3. **No conflicting active strong-anchor evidence** exists (PI-G).
4. **No supplied immutable external identifier** already maps to a *different* Property.
5. The resolution is recorded in an **auditable resolution record**.
6. The result is **reversible or explicitly overrideable** by an authorized user.

Resolve-before-create **prevents duplicate creation only**; it never redefines the surrogate identity and never performs a merge.

---

## 5. Locked Property-identity invariants

Binding, alongside Volume 12 §13 and Midpoint §E:

1. **`Property.id` is the canonical identity; anchors are evidence** that *resolve to* it.
2. **The identity index is derived and rebuildable** (from `Property` + accepted ledger evidence + immutable crosswalk).
3. **Raw and normalized anchor values are both preserved.**
4. **Normalization is deterministic and versioned.**
5. **External identifiers are immutable and uniquely scoped** by `(organization, provider, providerIdentifier)`.
6. **A provider identifier cannot silently move** from one Property to another (a change is a new immutable row; the old one persists).
7. **Conflicting strong anchors disable deterministic resolution** (→ review candidate).
8. **Resolve-before-create never physically deletes or merges** Properties.
9. **Candidate confirmation records a decision; it is not structural merge.**
10. **Every identity operation is organization-scoped and audited.**
11. **Parcel split, combination, reassessment, and renumbering are modeled as anchor history or replacement — never mutation of historical evidence.**
12. **Identity derivation is deterministic (R2).** `rebuildPropertyIdentity(Property, accepted ledger, crosswalk)` is a pure function → byte-for-byte identical `PropertyIdentity` (anchors + `parcelKey` + `identityVersion` + `rebuiltFromProjectionAt`) on every rebuild; a re-run performs **zero writes** (R4). The crosswalk is append-only with Signal-style supersession (R3) — never rewritten.
13. **Identity change is versioned along three independent axes (R5/R6).** The deterministic `identityVersion` fingerprint is a function of `IDENTITY_ALGORITHM_VERSION` + the winning anchors + the anchor normalizer versions — so a change in *evidence*, in *normalization*, or in the *derivation algorithm* is each individually detectable without diffing, and none of them relies on wall-clock or sequence. The canonical derived identity never depends on rebuild timing.
14. **Resolution replay is deterministic (RES-6).** Given identical `requestKey` + evidence + lookup state, the engine yields the identical target `Property`, `ResolutionBasis`, audit record, and candidate state — **replay correctness, stronger than duplicate suppression.**
15. **Resolution reversal never rewrites classification history (RES-7).** A reversal appends a `REVERSAL` event + crosswalk revocation + reversal metadata; it **never mutates or deletes** the original `RESOLVE` event or its `basis`. The historical classification stays true; only its operational effect changes.

---

## 6. Scope — sub-commits (PI-H) and the buildable-now boundary

**Commit 2c is headless-first:**

- **2c-i** — anchor projections (`apnNormalized`, `countyFipsCode`, `addressNormalized` as ledger-backed projected fields with raw preserved), deterministic **versioned normalizers** (APN + address), the **derived `PropertyIdentity` resolution surface**, the immutable **`PropertyExternalIdentifier` crosswalk** schema, plus **reconstruction + migration**. *(Headless — no resolution behavior yet.)*
- **2c-ii** — **guarded resolve-before-create** (the Tier 1A guards) + **deterministic candidate generation** (Tier 1B / Tier 2).
- **2c-iii** — **candidate-review + identity-resolution UI** (a thin consumer, mirroring the Owner candidate-review pattern where it genuinely fits — *not* by assumption).

**Buildable now (USER_ENTERED skeleton, no Decision F):** the anchor structures + crosswalk, the `(FIPS, APN)` key + deterministic address/APN normalizers, resolve-before-create at manual entry, Tier 1A guarded resolution + Tier 1B/Tier 2 candidates, and the review surface.

**Gated separately (Decision F / later slices):** licensed/public parcel + assessment ingestion, geocoding, address hygiene at CASS quality, richer signals, fuzzy matching, and structural Property merge.

---

## 7. Relationship to Architectural Debt

This lock **resolves** [AD7](./V1_2_ARCHITECTURE_STATUS.md#g-architectural-debt--intentionally-unresolved-design-questions) (anchors live in the ledger, with a *derived* rebuildable index) and **AD8** (guarded deterministic resolution on the parcel key, *not* proposal-only-everything and *not* unconditional auto-anchor). It states an **initial stance** on **AD1/AD2** (crosswalk-first; merge deferred with a trigger) and **AD4** (disagreement via the ledger + a conflict guard) — these remain carried debt until production evidence tests them. **AD3** (canonical address model) and **AD6** (licensing that changes architecture) stay gated on Decision F.

---

*Cross-references: design authority [Volume 12 §7.1, §13](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md) · checkpoint [V1.2 Midpoint Architecture Status](./V1_2_ARCHITECTURE_STATUS.md) · process [Engineering Playbook](./ENGINEERING_PLAYBOOK.md) · roadmap [Version 1.2](../roadmap/VERSION_1_2.md).*
