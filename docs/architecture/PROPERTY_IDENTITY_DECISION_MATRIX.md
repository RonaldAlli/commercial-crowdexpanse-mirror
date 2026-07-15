# Property Identity — Decision Matrix

> **Purpose.** The canonical, implementation-independent explanation of the Property-identity **Resolution** classifier: every inbound evidence pattern and its deterministic outcome. A developer should be able to understand *what the engine decides and why* from this page alone, without reading the code.
>
> **Authority.** This matrix mirrors the pure classifier `lib/intelligence/property-resolution.ts` (`classifyResolution`) exactly. The code is the executable source of truth; **this document must be updated in lockstep with it** (a change to the classifier that does not update this table is a defect). Behavioral guarantees are the RES-1…RES-7 invariants in the [Property Identity Lock §3.3](./PROPERTY_IDENTITY_LOCK.md) and Volume 12 §13. The guarded tiered rule and its guards are [lock §4](./PROPERTY_IDENTITY_LOCK.md).
>
> Scope: the **Property** resolution classifier introduced in Slice 2 Commit 2c-ii. Owner identity uses a different model (names/aliases/matchKey — Volume 12 §7.2).

---

## 1. Vocabulary

Resolution reduces raw inbound evidence to three org-scoped lookup results, then classifies purely on those.

| Term | Meaning |
|---|---|
| **Parcel key** | `${countyFipsCode}|${apnNormalized}` — formed **only when both FIPS and APN are present** (`parcelKeyOf`). APN alone (or FIPS alone) forms **no** parcel key. |
| **`parcelIds`** | Properties whose derived `PropertyIdentity.parcelKey` equals the inbound parcel key. |
| **`xwalkTargets`** | Properties an inbound **active** external identifier maps to (`PropertyExternalIdentifier`, `state = ACTIVE`). |
| **`addrIds`** | Properties matching the inbound `addressNormalized` **within the same jurisdiction** (same `countyFipsCode` when FIPS is present). |
| **Authoritative anchors** | The **parcel key** and an **external identifier**. `authoritative = distinct(parcelIds ∪ xwalkTargets)`. |
| **Weak anchor** | A normalized **address**. It never creates or blocks a Tier 1A resolve; it only proposes (Tier 2) when no authoritative match exists. |

**Authority hierarchy (locked, RES-4):** **parcel ↓ external identifier ↓ address.** An external identifier is an authoritative anchor, *not an override* of conflicting authoritative evidence.

---

## 2. The core rule

```
authoritative = distinct(parcelIds ∪ xwalkTargets)

|authoritative| == 1  → Tier 1A   resolve to that single property
|authoritative| >  1  → Tier 1B   conflicting authoritative evidence → candidates
|authoritative| == 0  →
        addrIds ≥ 1   → Tier 2    in-jurisdiction address agreement → proposal
        else          → NONE      create a new canonical property
```

That is the entire decision. Everything below is this rule enumerated.

---

## 3. The decision matrix

`P`, `Q` denote distinct existing properties. "—" = no match on that dimension. The classifier reads **only** these three columns.

| # | Parcel match | External-id match | Address (in-jurisdiction) match | Tier | Basis | Outcome |
|---|---|---|---|---|---|---|
| 1 | `{P}` | — or `{P}` | any | **1A** | `UNIQUE_PARCEL` | **Resolve to P** — do not create |
| 2 | — | `{P}` (single, consistent) | any | **1A** | `UNIQUE_EXTERNAL_IDENTIFIER` | **Resolve to P** — do not create |
| 3 | `{P}` | `{Q}` (Q ≠ P) | any | **1B** | `PARCEL_CONFLICT` | Create new + candidates {P, Q} |
| 4 | `{P, Q, …}` (≥2 share the parcel key) | any | any | **1B** | `PARCEL_CONFLICT` | Create new + candidates |
| 5 | — | `{P, Q, …}` (ids disagree) | any | **1B** | `EXTERNAL_ID_CONFLICT` | Create new + candidates |
| 6 | — | — | `{P, …}` | **2** | `ADDRESS_PROPOSAL` | Create new + proposal candidate(s) |
| 7 | — | — | — | **NONE** | *(none)* | Create new — no candidate, no audit event |
| 8 | *(APN or FIPS alone — no parcel key)* | falls through | falls through | — | — | Evaluated as if parcel absent → rows 2/5/6/7 |
| 9 | `{P}` | — or `{P}` | `{Q}` (Q ≠ P, weak) | **1A** | `UNIQUE_PARCEL` | **Resolve to P**; the differing address is recorded as **competing evidence** (a weak disagreement never blocks a unique authoritative parcel) |

**Reading the rows.** Rows 1–2 are the only paths that resolve to an existing property. Every other pattern **creates a new canonical property** (resolution never merges); ambiguity/conflict (3–5) and address agreement (6) additionally raise human-review candidates.

---

## 4. What each outcome *does* (side effects)

The classifier is pure (RES-1); these effects are applied by the orchestrator (`property-resolver.ts`) along the fixed sequence **Normalize → Lookup → Conflict Inspection → Classification → Decision → Attachment → Audit → Candidate → Rebuild** (RES-2).

| Tier | Property | Enrichment | Crosswalk | Audit | Candidate |
|---|---|---|---|---|---|
| **1A** | **Existing** (resolved) | Inbound anchors recorded as **appended** observations on the resolved property, retaining original source metadata (RES-5 — evidence is never rewritten) | Supplied external ids attached (idempotent) | Append-only `PropertyResolution` **RESOLVE** event with `basis` | — |
| **1B** | **New** | Genesis observations on the new property | — (never auto-attached) | — | `PropertyMatchDecision` PENDING per candidate |
| **2** | **New** | Genesis observations on the new property | — | — | `PropertyMatchDecision` PENDING (proposal) |
| **NONE** | **New** | Genesis observations on the new property | — | — | — |

- **`basis`** is deterministic **explanatory metadata** (why this path) — never an input to behavior, never a score (RES-3).
- **Replay (RES-6):** identical `requestKey` + evidence + lookup state ⇒ identical property, basis, audit record, and candidate state (stronger than "no duplicate").
- **Reversal (RES-7):** a Tier-1A resolution is reversed by **appending** a `REVERSAL` event and revoking its crosswalk attachments (`ACTIVE → SUPERSEDED` via `revokedByResolutionId`); the original `RESOLVE` event and its `basis` are never mutated — the historical classification stays true, only its operational effect changes.
- **Candidate lifecycle:** confirm/dismiss record a **decision only** (no merge/create/delete/repoint, no Signal); a dismissed pair re-surfaces only on a material identity change (its `identityVersion`-based fingerprint drifts) or an explicit ADMIN reopen. Structural Property merge is deferred (AD1/AD2).

---

## 5. Worked examples

- **Same parcel, re-submitted** → row 1 → resolves to the existing property; one RESOLVE event; no duplicate. *(This is the core anti-duplication guarantee.)*
- **County record carries a provider id already on file, no parcel** → row 2 → resolves via the crosswalk.
- **Parcel says P but the provider id already maps to Q** → row 3 → no auto-resolve; a new property and candidates against both P and Q (a human decides). *(Decision A: an external id is an anchor, not an override.)*
- **Two existing properties accidentally share a parcel key** → row 4 → the ambiguity is surfaced, never silently picked.
- **Only a street address, same county** → row 6 → a new property plus a proposal for the address mate.
- **Brand-new parcel and address** → row 7 → an ordinary create.
- **Manual create today (no anchor inputs)** → row 7 (`NONE`) → behaves exactly like an ordinary create — which is why 2c-ii is behavior-preserving and headless until 2c-iii supplies anchors.

---

## 6. Boundaries (what the classifier deliberately does **not** do)

No fuzzy matching, no geospatial proximity, no scoring/confidence/probability, no AI, no cross-jurisdiction address matching, no external-source ingestion, and **no structural merge** — all separately gated (lock §3.3 RES-4, PI-D/PI-F/PI-H). The classifier is a **finite, deterministic decision over three exact lookups**; that finiteness is what makes this matrix complete.
