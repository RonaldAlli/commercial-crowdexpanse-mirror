# CrowdExpanse — Business Domain Model
## CrowdExpanse Reference Architecture — Document 2

> **Status:** DRAFT for founder review (rev. 2026-07-27). This document sits beneath the
> **Constitution (Document 0)** and the **Operating Model (Document 1)** and must obey both.
> It is the first document engineering will implement from — so read this warning first:

> **This is not an entity catalog. It is the Business Domain Model.**
> Every object here is defined from the perspective of the **business**, not the software.
> The database schema, APIs, and screens are *representations* of this model — they are not
> this model. If you are tempted to read this as a table definition, stop: read the
> **Purpose** and **Business Meaning** of each object first. The reason an object exists
> governs how it may ever be represented.

Documents 0 and 1 are the **why** of the company. This document is the **what** — the formal
description of what exists in the business, what each thing means, and how they relate.
Everything after it (Language, Events, Lifecycles, Platform, Engineering, Automation, AI) is
the **how**.

---

## The Business Object Template

Every object below is defined with the *same* eight-part structure, in the same order. The
order is deliberate: business meaning is established before software representation is even
mentioned.

1. **Purpose** — *Why must this object exist for the business to operate?* (Not "what is it.")
2. **Business Meaning** — What it represents in the real world. Not software. Reality.
3. **Characteristics** — What makes it distinct (long-lived · temporary · legal · financial · relationship · operational).
4. **Ownership** — Which department owns it.
5. **Lifecycle** — Which lifecycle governs it (the *name* of the lifecycle, not its states — states live in Document 5).
6. **Events** — Which canonical business events may affect it (defined authoritatively in Document 4).
7. **Relationships** — Split into **Structural** (permanent) and **Business** (appear and disappear).
8. **Platform Representation** — *Only now:* how CrowdExpanse represents it. Representation, not implementation.

---

## Market

**1. Purpose.** A Market exists because the company has finite attention and capital and
must decide **where** to deploy them. Without a Market, sourcing is undirected and every
downstream object is unattributable. The Market is the source of all supply.

**2. Business Meaning.** A defined arena of investment: a *geographic area · asset class ·
investment thesis · market strategy · target owner profile · investment criteria.* For
example, "absentee-owned 50+ unit multifamily in the Atlanta MSA, 1980–2005 vintage." It is
the container from which supply is generated.

**3. Characteristics.** Long-lived · strategic · operational. It defines scope; it is never a
transaction.

**4. Ownership.** Management / Market Research.

**5. Lifecycle.** Market Lifecycle.

**6. Events.** Market Defined · Market Thesis Updated · Market Activated · Market Paused · Market Retired.

**7. Relationships.**
- *Structural:* A Market **contains** Properties (each Property belongs to exactly one Market). Buyers **operate in** one or more Markets.
- *Business:* Operators and capital partners may **focus on** a Market for a time.

**8. Platform Representation.** A first-class Market record carrying its criteria, to which
every sourced object can be traced. *(Not yet built — planned; today "market" is context, not
an entity.)*

---

## Property

**1. Purpose.** Property exists because the **physical asset is real and independent of us.**
It is what is ultimately bought, sold, financed, and operated — the thing all value refers to.

**2. Business Meaning.** A specific commercial real-estate asset: a parcel and its
improvements, with an address, physical characteristics, and legal ownership. It exists
whether or not we know it, and it can be owned and sold many times over its life.

**3. Characteristics.** Long-lived · physical · real-world. Independent of any single
transaction.

**4. Ownership.** Acquisitions (during sourcing); Transaction Coordination (once in a Deal).

**5. Lifecycle.** Property Lifecycle (identity and enrichment, not a transactional state).

**6. Events.** Property Identified · Property Enriched · Ownership Recorded · Property Under Contract · Property Transferred.

**7. Relationships.**
- *Structural:* **Belongs to** exactly one Market. **Owned by** one or more Owners.
- *Business:* Is the **subject of** an Opportunity; may be **managed by** an Operator.

**8. Platform Representation.** A Property entity keyed by a deterministic property identity
with an immutable crosswalk, so the same real-world asset is never duplicated across sources.

---

## Owner

**1. Purpose.** Owner exists because **property has legal ownership** — someone holds title.
The business must know who controls an asset whether or not that person ever speaks to us.

**2. Business Meaning.** The legal owner — a person or entity — of one or more commercial
properties. Part of the Market. May hold an entire portfolio. May never become a Seller.

**3. Characteristics.** Long-lived · legal · market-side. Portfolio-bearing.

**4. Ownership.** Market Research (as market inventory); Acquisitions (as a sourcing target).

**5. Lifecycle.** Owner Lifecycle.

**6. Events.** Owner Identified · Owner Enriched · Owner Contacted · Owner Portfolio Updated.

**7. Relationships.**
- *Structural:* **Owns** one or more Properties.
- *Business:* **Becomes** a Seller — through a conversation.

**8. Platform Representation.** An Owner entity: the durable title-holder, kept distinct from
the Seller relationship that may later arise from it.

---

## Seller

**1. Purpose.** Seller exists because **acquisitions happen through relationships**, not
against records. An Owner only becomes actionable once a conversation begins; the Seller is
that relationship.

**2. Business Meaning.** A Seller is **not a person.** It is a **business relationship** that
comes into being when an Owner — or an authorized decision-maker — enters an acquisition
conversation with us. The model is `Owner → conversation → Seller`. The same Owner could, at
different times, be no Seller, an active Seller, or a dormant one.

**3. Characteristics.** Relationship · evolving · operational. Can be nurtured, can go
dormant, can end.

**4. Ownership.** Acquisitions.

**5. Lifecycle.** Seller Lifecycle.

**6. Events.** Conversation Started · Seller Engaged · Motivation Captured · Seller Qualified · Seller Disqualified · Seller Nurtured.

**7. Relationships.**
- *Structural:* None permanent — a relationship is itself a join. It references the Owner it originates from.
- *Business:* **Originates from** an Owner; **may create** an Opportunity.

**8. Platform Representation.** A Seller entity carrying relationship and outreach state,
explicitly born from an Owner. The Owner→Seller origin must be represented, not implied.

---

## Buyer

**1. Purpose.** Buyer exists because **demand must exist before supply can be monetized.**
Disposition requires a standing inventory of demand, built continuously from day one — a
Buyer is **never** created because an Opportunity happens to exist.

**2. Business Meaning.** A party — investor, fund, or operator — with capital and acquisition
criteria who buys controlled deals. An independent business asset, built in parallel to
Owners and Sellers.

**3. Characteristics.** Long-lived · relationship + financial · operational. A standing
inventory.

**4. Ownership.** Disposition.

**5. Lifecycle.** Buyer Lifecycle.

**6. Events.** Buyer Added · Buyer Criteria Captured · Buyer Verified · Buyer Interested · Buyer Committed.

**7. Relationships.**
- *Structural:* **Operates in** one or more Markets.
- *Business:* **Becomes** an Interested Buyer for a Deal; **commits to** a Transaction.

**8. Platform Representation.** A Buyer entity plus a match construct; matching to supply
happens later, never at the moment the Buyer is created.

---

## Opportunity

**1. Purpose.** Opportunity exists because **interest is not control.** The business needs a
way to represent a potential acquisition it is actively working *before* any legal control
exists — and to accept that most will never become deals.

**2. Business Meaning.** A potential acquisition: a Seller relationship plus a target
Property (or properties) that the business believes it could acquire. A working hypothesis of
a deal.

**3. Characteristics.** Temporary · operational · a business construct.

**4. Ownership.** Acquisitions (through the hand-off to Underwriting).

**5. Lifecycle.** Opportunity Lifecycle.

**6. Events.** Opportunity Created · Financials Received · Underwriting Complete · Offer Prepared · Offer Submitted · Offer Accepted · Offer Rejected · Opportunity Abandoned.

**7. Relationships.**
- *Structural:* None permanent.
- *Business:* **Created by** a Seller; **concerns** one or more Properties; **becomes** a Deal upon legal control.

**8. Platform Representation.** An Opportunity entity moving through pipeline stages — kept
strictly distinct from the Deal that legal control creates.

---

## Deal

**1. Purpose.** Deal exists because **legal control creates rights and obligations.** Once we
control an opportunity contractually, an entirely different object is in play: one with
deadlines, earnest money, contingencies, and liabilities. **This is where the business is
paid.**

**2. Business Meaning.** An Opportunity over which we have obtained **contractual or legal
control.** A Deal carries what an Opportunity never does: enforceable rights, obligations,
timelines, and money at risk.

**3. Characteristics.** Legal · financial · time-boxed · operational.

**4. Ownership.** Transaction Coordination.

**5. Lifecycle.** Deal Lifecycle.

**6. Events.** Contract Executed · Earnest Money Deposited · Contingency Cleared · Buyer Selected · Closing Scheduled · Deal Closed · Deal Terminated.

**7. Relationships.**
- *Structural:* None permanent.
- *Business:* **Originates from** exactly one Opportunity; **concerns** one or more Properties; **matched with** a Buyer; **financed by** a Lender; **may include** a Partner; **realized by** a Transaction.

**8. Platform Representation.** A first-class Deal entity — the natural parent of the escrow,
financing, assignment, and closing-checklist records that today exist without a shared parent.

---

## Transaction

**1. Purpose.** Transaction exists because **controlled deals must be executed.** Holding
control is not the same as completing the exchange; the execution has its own steps, parties,
and money movement.

**2. Business Meaning.** The execution process that converts a controlled Deal into a
completed exchange of property and consideration — the close, whether by assignment,
double-close, or direct acquisition.

**3. Characteristics.** Operational · financial · temporary. A **process**, not a record of
state.

**4. Ownership.** Transaction Coordination / Closing.

**5. Lifecycle.** Transaction Lifecycle.

**6. Events.** Escrow Opened · Funds Received · Documents Signed · Transaction Closed · Transaction Funded · Transaction Failed.

**7. Relationships.**
- *Structural:* None permanent.
- *Business:* **Executes** exactly one Deal; **involves** a Buyer, and possibly a Lender or Partner; **produces** Revenue.

**8. Platform Representation.** Composed from escrow, financing, assignment, and
closing-checklist records under the Deal — the running execution, not merely its final state.

---

## Revenue

**1. Purpose.** Revenue exists because **the business must know it was paid, and why.** It
records the economic outcome of a completed Transaction and lets that outcome be attributed
back to the Market and source that produced it.

**2. Business Meaning.** The money the business earns from a completed Transaction — an
assignment fee, double-close profit, acquisition fee, JV split, or equity participation.

**3. Characteristics.** Financial · permanent · reportable. An immutable historical fact.

**4. Ownership.** Accounting.

**5. Lifecycle.** Revenue Lifecycle.

**6. Events.** Revenue Recognized · Revenue Attributed · Revenue Reconciled.

**7. Relationships.**
- *Structural:* None permanent.
- *Business:* **Originates from** exactly one completed Transaction; **attributed to** the Market and source that produced it.

**8. Platform Representation.** Derived from authoritative Transaction facts — never from
display strings or manual entry — and retaining enough attribution to reconstruct its
acquisition source.

---

## The Commercial Acquisition Domain (business diagram)

This is a **business** diagram, not a software diagram. It shows how the objects give rise to
one another in reality.

```
                        MARKET
                  (creates opportunity)
                          │
                          ▼
                       PROPERTY
                          ▲
                          │
                      owned by
                          │
                        OWNER
                          │
                 conversation creates
                          │
                        SELLER
                          │
                          ▼
                     OPPORTUNITY
                          │
                legal control creates
                          │
                         DEAL
                          │
                 matched with demand
                          │
        BUYER ────────────┘
                          │
                          ▼
                     TRANSACTION
                          │
                          ▼
                       REVENUE
```

Read it as a sentence: a **Market** frames where we look; within it **Properties** exist,
**owned by Owners**; a **conversation** with an Owner creates a **Seller**; a Seller may
create an **Opportunity**; **legal control** turns an Opportunity into a **Deal**; the Deal is
**matched with a Buyer** from standing demand; the match is executed as a **Transaction**;
the Transaction produces **Revenue**.

---

## Business Invariants

**This is the most important section in the document.** These are truths that must **always**
remain true. They are not implementation details; they are the business's definition of a
correct state of the world. Every engineer inherits them as tests — any system state that
violates one is a defect regardless of what the code says.

1. Every **Property** exists inside exactly one **Market**.
2. Every **Seller** originates from an **Owner** relationship.
3. Every **Opportunity** originates from a **Seller**.
4. Every **Deal** originates from exactly one **Opportunity**.
5. Every **Transaction** executes exactly one **Deal**.
6. **Revenue** may only originate from a completed **Transaction**.
7. A **Buyer** is never created because an Opportunity exists; demand is built independently.
8. **Business events are immutable.**
9. **Lifecycle state is derived from events** — it is never hand-set.
10. **AI may never create a canonical business object.**
11. **AI may never author a canonical event.**
12. The **Business Language Specification governs every object name** — nothing enters the software under a name that does not exist there.

---

> **This document defines reality as CrowdExpanse understands it. Every database schema, API,
> workflow, report, automation, dashboard, integration, and AI capability must faithfully
> represent this domain model. If implementation and this model diverge, this model is
> authoritative and implementation must be corrected.**

---

*Next in the set: **Document 3 — Business Language Specification** (the single authoritative
word-list, governed as a controlled contract).*
