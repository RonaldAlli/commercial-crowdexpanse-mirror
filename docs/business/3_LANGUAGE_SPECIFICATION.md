# CrowdExpanse — Business Language Specification
## CrowdExpanse Reference Architecture — Document 3

> **Status:** §1–§7 **RATIFIED** by the founder 2026-07-27 (rev. 2026-07-27). Canonical
> Vocabulary (§2) is frozen; Deprecated Vocabulary (§3) is populated from the Language Conflict
> Report. Changes from here are governed exactly like a public API — see `CHANGE_GOVERNANCE.md`
> (API-grade process · No-Synonyms Rule · No-Homonyms Rule).

## What this document is

The Business Language Specification is the **single authoritative vocabulary of the company,**
derived from the business, not the software (`Reality → Business → Language → Code`). The
codebase was harvested only as a **validation source**; the divergences it revealed are recorded
in `LANGUAGE_CONFLICT_REPORT.md` and resolved below. The Specification is the **compiler**: every
representation (schema, API, UI, report, AI prompt) is validated *against* it.

---

## Section 1 — Business Concepts *(authoritative, from the Domain Model)*

A **concept** is a thing the business means. Words change; concepts do not. Every noun in the
platform maps to exactly one of these nine — or to Platform Vocabulary (§7), which is explicitly
*not* business.

| Concept | Kind | Meaning (one line) |
|---|---|---|
| **Market** | Entity (container) | a defined arena of investment; the source of all supply |
| **Property** | Entity | the physical commercial asset |
| **Owner** | Entity | the legal title-holder of one or more Properties |
| **Seller** | Relationship | the relationship born when an Owner enters an acquisition conversation |
| **Buyer** | Entity | a party with capital and criteria who acquires controlled deals |
| **Opportunity** | Business construct | a potential acquisition, not yet legally controlled |
| **Deal** | Legal construct | an Opportunity over which we have obtained contractual/legal control |
| **Transaction** | Execution process | the execution that converts a controlled Deal into revenue |
| **Revenue** | Outcome | money earned from a completed Transaction |

---

## Section 2 — Canonical Vocabulary *(RATIFIED — frozen)*

The **one official word** for each concept, relationship, event, and department. Only canonical
words appear in UI, APIs, reports, and documentation.

### Canonical nouns
`Market` · `Property` · `Owner` · `Seller` · `Buyer` · `Opportunity` · `Deal` · `Transaction` · `Revenue`

### Ratified language decisions
- **State is event-derived, and that is the *only* canonical state model.** The mutable
  13-value `OpportunityStage` is demoted to a **compatibility layer**, not the authority. *(Business
  Evolution Initiative BE-4.)*
- **Each object owns its own lifecycle.** "Pipeline state" is not a thing one object carries; the
  Seller, Opportunity, Deal, and Transaction each have their own lifecycle (Document 5). The
  old single enum conflated four of them.
- **"Lead" is RETIRED — not renamed.** *Lead* is a marketing word, not a commercial-acquisition
  word. Inside CrowdExpanse the progression is `Owner → Seller → Opportunity → Deal`; there is no
  "Lead." Marketing may still generate prospects externally, but the word does not enter the
  platform.
- **"Deal" means only the legal construct** (a controlled Opportunity). It is never a synonym for
  Opportunity. *(BE-2.)*
- **"Transaction" is a first-class concept** — the execution process, distinct from Deal and from
  Revenue. *(BE-5.)*
- **"Match" means only Buyer ↔ Deal.** Identity-deduplication is **Resolution / Merge**, never
  "match."
- **"Acquisition Channel"** is the structured business origin of a Seller/Opportunity; free-text
  `source` is retired. Data-lineage "provenance" is a separate technical namespace.
- **"Pipeline"** is Platform Vocabulary (a *view* of Opportunities), not a business concept.

### Canonical relationship verbs — see §4. Canonical events — see §5 / Document 4. Departments — see §6.

---

## Section 3 — Deprecated Vocabulary *(populated from the Conflict Report)*

Recorded, **never used on a live surface**, kept only to map old usage during migration and to
power search.

| Deprecated word (as used) | Maps to | Where it appears today | Retire via |
|---|---|---|---|
| **Lead** (stage + prospect) | Owner (pre-conversation) / Seller (early state) | `OpportunityStage.LEAD`; `acquire/page.tsx:174`; import flows | immediate (language); BE-4 (code) |
| **Deal** (= Opportunity) | Opportunity | analyzer, `opportunity-form.tsx:85`, `dashboard/page.tsx:123` | BE-2 |
| **Pipeline** (= Opportunity object) | Opportunity | nav `workspace-shell.tsx:24` | BE-3 (view sense stays, §7) |
| **deal contact / target / contact** (= the acq party) | Seller | `schema.prisma:899`; `acquire/page.tsx:130` | BE-3 |
| **Opportunity.source** (free-text) | Acquisition Channel | `schema.prisma:1164` | BE-3 |
| **closed-won** | Transaction Closed | `queries.ts:70` | BE-3 |
| **OpportunityStage** (as authority) | event-derived state | `schema.prisma:23-37` | BE-4 |
| **transaction** (= Closing dashboard / AssignmentRecord) | Transaction (concept) | `workspace-shell.tsx:27`; `schema.prisma:2039` | BE-5 |
| **match** (= dedupe) | Resolution / Merge | `OwnerMatchDecision`, `PropertyMatchDecision` | BE-3 |
| **owner** (= Task assignee) | assignee | `Task.ownerId` `schema.prisma:1741` | BE-3 |

---

## Section 4 — Relationship Vocabulary *(verbs — authoritative)*

| Verb | Subject → Object | Meaning | Kind |
|---|---|---|---|
| **Owns** | Owner → Property | legal title | Structural |
| **Belongs to** | Property → Market | a Property sits inside exactly one Market | Structural |
| **Operates in** | Buyer → Market | a Buyer's active markets | Structural |
| **Becomes** | Owner → Seller | a conversation creates the Seller relationship | Business |
| **Represents** | Seller → Owner | the relationship stands for the Owner | Business |
| **Negotiates** | Acquisitions ↔ Seller | working toward an Opportunity / offer | Business |
| **Controls** | CrowdExpanse → Deal | contractual/legal control of an Opportunity | Business |
| **Matches** | Deal ↔ Buyer | a controlled Deal is matched to demand | Business |
| **Executes** | Transaction → Deal | the close that realizes a controlled Deal | Business |
| **Finances** | Lender → Deal | capital provided against a Deal | Business |
| **Operates** | Operator → Property | management of the asset *(not in the wholesale model today)* | Business |

---

## Section 5 — Event Vocabulary *(canonical event NAMES — defined in Document 4)*

Events are **past-tense** and **immutable** (Change Governance). **State is derived from events;**
a state word is never an event word. Canonical seed (authoritative meanings in Document 4):

`Market Defined` · `Owner Identified` · `Conversation Started` · `Seller Qualified` ·
`Opportunity Created` · `Underwriting Completed` · `Offer Accepted` · `Deal Controlled` ·
`Buyer Matched` · `Transaction Opened` · `Transaction Closed` · `Revenue Recognized`

---

## Section 6 — Department Vocabulary *(provisional — departments are mutable)*

Presumptive canonical set, reconciled with the Operating Model and `UserRole`
(`schema.prisma:205-210`): `Market Research` · `Acquisitions` · `Underwriting` ·
`Transaction Coordination` · `Disposition` · `Finance`. *(Singular "Disposition" and "Finance"
over "Accounting" chosen provisionally; low-stakes and change-controlled at operational cadence.)*

---

## Section 7 — Platform Vocabulary *(reserved words — NOT business concepts)*

These name **representations**, not reality, and must never stand in for a business concept:
`Workspace` · `Dashboard` · `Pipeline` (a view of Opportunities) · `Queue` · `Panel` · `Timeline`
· `Record` · `View` · `Report` · `Copilot`.

> Rule: a report or API refers to a business thing by its **business** word (§2), never a platform
> word. "Show the Seller," not "show the record."

---

*Next: **Document 4 — Business Event Vocabulary** (what business truths are permanently recorded).*
