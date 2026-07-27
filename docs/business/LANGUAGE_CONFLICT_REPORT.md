# CrowdExpanse — Language Conflict Report
## Passes 2–4 for the Business Language Specification (Document 3)

> **Status:** DRAFT for founder ratification (rev. 2026-07-27). Produced by harvesting the
> implementation as a **validation source** (`Reality → Business → Language → Code`). It maps
> every implementation word onto the nine business concepts, and surfaces where the code uses
> **several words for one concept** (aliases, No-Synonyms) or **one word for several concepts**
> (homonyms, No-Homonyms). It ends with a **Ratification Worksheet** — the canonical choices you
> must approve before §2 of Document 3 freezes and §3 populates. All `file:line` refs are to the
> live codebase.

## The headline finding

The platform carries **two parallel, coexisting "stage" vocabularies**, and this single split is
the root of most conflicts below:

- **(A) Legacy authoritative** — `Opportunity.stage: OpportunityStage`, **13 persisted, mutable
  values** (`prisma/schema.prisma:23-37`).
- **(B) Event-derived** — an append-only `PipelineFact` ledger projected into a **disposable
  7-entry `StageSpine`** (`lib/pipeline-projection/spine.ts:6-18`), each entry bound to a
  decision fact.

They overlap but use different value sets and **opposite authority models** (mutable-persisted
vs derived-from-events). The Constitution says lifecycle state is *derived from events* (Business
Invariant 9), which points at (B) as canonical — but that is a **business decision for you**, not
one the report can make.

**Compounding this:** the 13-value `OpportunityStage` enum is not one lifecycle — it **conflates
four object lifecycles into a single field**: Seller (`LEAD, SELLER_CONTACTED, INTERESTED_SELLER,
FINANCIALS_REQUESTED, T12_RECEIVED, RENT_ROLL_RECEIVED`), Opportunity (`UNDERWRITING, OFFER_READY,
LOI_SENT`), Deal (`UNDER_CONTRACT`), Buyer (`BUYER_MATCHED`), and Transaction (`CLOSING, PAID`).
This is the clearest evidence yet for the multi-lifecycle design in Document 2, and it is the core
input to Document 5 (Lifecycles).

---

## The three required distinctions — verdict

| Distinction | Verdict | Detail |
|---|---|---|
| **Owner vs Seller** | ✅ **Distinct by design** | `Owner` = canonical title-holder (`schema.prisma:542`, "Distinct from Seller"); `Seller` = deal-contact relationship linked by `Seller.ownerId` (`:899`). **Caveat:** `ownerId` is nullable (v1.2 additive), and outreach/lead state lives on `Seller` — so the *relationship* and the *prospect* are the same row, and a Seller without a linked Owner is still an owner+lead conflation. |
| **Opportunity vs Deal** | ❌ **Conflated** | No first-class `Deal`. "Control" is a *value* (`OpportunityStage.UNDER_CONTRACT`) + a `CONTRACT_EXECUTED` fact. "Deal" floats as a UI/BI synonym for Opportunity. → **Alignment Initiative 2.** |
| **Transaction vs Deal** | ❌ **Conflated, three ways** | "Transaction" = the Closing dashboard (*process*, `workspace-shell.tsx:27`) **and** `AssignmentRecord` ("core wholesale transaction record", *the controlled deal*, `schema.prisma:2039`) **and** `TRANSACTION_CLOSED` (*the close event*) **and** `transaction_reference`/`FUNDS_DISBURSED` (*the money*). No single `Transaction` object. → **new Alignment Initiative candidate.** |

---

## Aliases — one concept, several words (No-Synonyms candidates)

| Concept | Competing words (where) | Recommended canonical | Deprecate → alias |
|---|---|---|---|
| **Opportunity** | `Opportunity` model/route; nav **"Pipeline"** (`workspace-shell.tsx:24`); **"Deal"/"Deals"** in analyzer, `opportunity-form.tsx:85`, `opportunities/new/page.tsx:57`, `dashboard/page.tsx:123` | **Opportunity** | "Pipeline" → Platform Vocabulary (a *view* of Opportunities); "Deal"(=Opportunity) → **retire** (Deal becomes its own concept) |
| **Seller** (the acquisition-side party for one Owner) | "deal contact" (`schema.prisma:899`), "lead" (`acquire/page.tsx:174`), "target" (`:130`), "contact" | **Seller** (relationship; verb **represents** Owner) | "deal contact", "lead"(=seller), "target"(=seller), "contact"(=seller) → deprecate |
| **Acquisition channel** (lead origin) | `AcquisitionChannel` enum (`:154`); `Opportunity.source` free-text (`:1164`) | **Acquisition Channel** (structured; per Attribution Rule 1) | free-text `Opportunity.source` → deprecate |
| **Lifecycle state / "stage"** | `OpportunityStage` 13 mutable (`:23-37`) vs `StageSpine` 7 derived (`spine.ts:10-16`) | **the event-derived state** *(recommend; needs ratification)* | mutable `OpportunityStage` → deprecate to legacy; split by object lifecycle (Doc 5) |
| **Control / under contract** | `UNDER_CONTRACT` (`:33`); `CONTRACT_EXECUTED` (`spine.ts:14`); `AssignmentStatus.EXECUTED` (`:2035`) | concept **Deal**; event **Controlled** (a.k.a. Contract Executed) | others → map to the one event |
| **Close / paid** | `CLOSING`+`PAID` (`:35-36`); `CLEAR_TO_CLOSE`+`PAID` (`spine.ts:15-16`); `TRANSACTION_CLOSED`; BI "closed-won" (`queries.ts:70`); `SETTLEMENT_COMPLETED`/`FUNDS_DISBURSED` | concept **Transaction**; events **Closed**, **Paid** | "closed-won" (CRM-ism) → deprecate |
| **Revenue** | `executedRevenueUsd` (BI); `executedFeeUsdSnapshot` (`:2062`); `assignmentFeeUsd`/`contractValueUsd` (`:1172-1173`) | **Revenue** = `executedFeeUsdSnapshot` where EXECUTED (per BI Rule 1) | mutable fee fields are *inputs*, not Revenue |
| **Qualified / matched (two paths)** | seller `QUALIFIED` (`:146`); `BUYER_QUALIFIED`/`BUYER_MATCHED` | qualify by object: **Seller Qualified** vs **Buyer Qualified**; **Matched** = Buyer↔Deal only | bare "qualified"/"matched" → object-qualified |

---

## Homonyms — one word, several meanings (No-Homonyms candidates)

| Word | Distinct meanings | Recommended resolution |
|---|---|---|
| **stage** | (a) persisted `OpportunityStage`; (b) derived projection stage; (c) timeline label; (d) `stageRank`/`isInFlightStage` reinterpreting (a) | Reserve **"stage"** as **Platform Vocabulary** (a *view* over states). Business truth is a per-object **state**, derived from events. |
| **lead** | (a) `OpportunityStage.LEAD` base stage; (b) a Seller/prospect record ("lead queue", "lead import") | **Fork for you:** either (i) **retire "Lead"** entirely — pre-conversation = Owner, post-conversation = Seller (early state) — *recommended*; or (ii) define **Lead** = a pre-conversation prospect and use it nowhere else. |
| **target** | active Seller; Buyer criteria (`targetAssetTypes`); `targetCloseDate`; refresh `targetEntityType`; `targetStage`; `TARGET_LTV_PCT`; `AiEnvTarget` | Deprecate bare **"target"** as a synonym for the active Seller. Compound field names (targetCloseDate, TARGET_LTV) are qualified and may stay. |
| **source** | `Opportunity.source` origin; `AssumptionSource`; `SourceCategory` provenance; `sourceKey` idempotency; "source of truth" | Split: **Acquisition Channel** (business origin) vs **provenance/source-category** (data lineage, technical namespace). Retire free-text `Opportunity.source`. |
| **match** | `BuyerMatch` (buyer↔opportunity); `OwnerMatchDecision` (dedupe); `PropertyMatchDecision` (dedupe) | **"Match"** (business) = Buyer↔Deal only. Rename dedupe uses to **Resolution/Merge** (identity resolution). |
| **deal** | Opportunity (UI); executed deal (`dealCount`, `queries.ts:41`); `DealAnalysis` (deprecated); `FindingCategory.DEAL_QUALITY` | Resolve via **Alignment Initiative 2** (Deal = first-class). Until then, stop using "Deal" for Opportunity. |
| **transaction** | Closing dashboard (process); `AssignmentRecord` (controlled deal); `TRANSACTION_CLOSED` (event); `transaction_reference` (money); Prisma `$transaction` (incidental) | Make **Transaction** first-class (execution process); it is **not** the Deal and **not** the Revenue. |
| **status** | ~20 typed enums (Escrow/Financing/Assignment/…), disjoint values | **Acceptable** — each is namespaced by its object; a typed field-name pattern, not a business-concept homonym. No action. |
| **owner** | `Property.ownerId` = title-holder (business); `Task.ownerId` = assignee/User (`:1741`) | Rename the *assignee* use → **assignee** (not "owner"). |

---

## Gaps — business concepts with no first-class implementation term

- **Market — confirmed gap.** No model/route/enum/nav; the word is only a display label (Seller
  city/state) and Buyer "target market" prose. `IntelligenceEntityType` reserves `MARKET` in a
  comment only (`schema.prisma:302`). → **Alignment Initiative 1.**
- **Deal — confirmed gap.** No first-class object; control is a stage value + a fact. → **Alignment
  Initiative 2.**
- **Transaction — gap.** No `Transaction` object distinct from Deal and Revenue. → **new Alignment
  Initiative candidate (BE-5).**
- **Relationship verbs — mostly implicit.** `owns` (`Property.ownerId`), `represents`
  (`Seller.ownerId`), `finances` (`FinancingRecord`), `matches` (`BuyerMatch`) exist; **`controls`
  and `negotiates` have no term** (only stage values / LOI facts); **`operates` does not exist**
  (this is a wholesale/assignment model — an Operator-of-Property relation is not present).

---

## Departments (from `UserRole`, `schema.prisma:205-210`)

Code roles: `ADMIN · ACQUISITIONS · ANALYST · DISPOSITIONS`. To reconcile with Document 3 §6:
**"Disposition" (Doc) vs "Dispositions" (code)** — pick one; **Finance vs Accounting** — pick one;
**Analyst** is a role, not a department (map to Underwriting?).

---

## Ratification Worksheet — decisions only you can make

Per Change Governance, the Language is **founder-ratified**. Recommended answers are marked ▶.
Approve, or override, each:

1. **Canonical nouns** — accept the nine concept names as canonical (Market, Property, Owner,
   Seller, Buyer, Opportunity, Deal, Transaction, Revenue)? ▶ *Yes.*
2. **"Pipeline"** — reclassify as Platform Vocabulary (a view of Opportunities), not a concept? ▶ *Yes.*
3. **"Deal" for Opportunity** — retire (Deal becomes its own concept via Alignment Initiative 2)? ▶ *Yes.*
4. **Lifecycle state authority** — make the **event-derived** state canonical and deprecate the
   mutable 13-value `OpportunityStage` to legacy (feeds Document 5 + Alignment Initiative 4)? ▶ *Yes — it matches Invariant 9.*
5. **"Lead"** — **retire entirely** (pre-conversation = Owner; post-conversation = Seller) ▶, or
   keep "Lead" defined strictly as a pre-conversation prospect?
6. **"Match"** — restrict to Buyer↔Deal; rename dedupe "match" → Resolution/Merge? ▶ *Yes.*
7. **"source"** — split into **Acquisition Channel** (business) vs provenance (technical); retire
   free-text `Opportunity.source`? ▶ *Yes.*
8. **"Transaction"** — confirm it is a distinct concept (execution process), separate from Deal and
   Revenue → open **Alignment Initiative 5 (Transaction first-class)**? ▶ *Yes.*
9. **`Task.ownerId`** — rename the assignee use to **assignee** (free "owner" for the title-holder)? ▶ *Yes.*
10. **Departments** — canonical singular/plural (**Disposition**?) and **Finance vs Accounting**
    (one word)?

Once ratified: Document 3 §2 (Canonical) freezes, §3 (Deprecated) is populated from the alias/homonym
tables above, and any new gaps become Alignment Initiatives (1, 2, and the proposed 5).
