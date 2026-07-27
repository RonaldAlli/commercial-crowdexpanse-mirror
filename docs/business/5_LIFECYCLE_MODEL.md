# CrowdExpanse — Business Lifecycle Model
## CrowdExpanse Reference Architecture — Document 5

> **Status:** DRAFT for founder review (rev. 2026-07-27). Obeys the Domain Model (Document 2),
> the Language Specification (Document 3), and the Event Vocabulary (Document 4). It answers one
> question, and **only** this question:
>
> **How does a business object evolve?**

This document is **object-centric and people-free.** No departments, no roles, no screens, no
queues — those belong to Document 6 (Workflow Model). A lifecycle exists whether or not anyone
does work today; that is precisely why it is a separate, slower-changing document.

## The one rule that governs every lifecycle

**State is derived from events; it is never hand-set.** Each state below is a *projection* of the
events in Document 4 — a computed view of "where this object is," reconstructable at any time from
its event history. This is why the mutable 13-value `OpportunityStage` is being retired to a
compatibility layer (Business Evolution Initiative BE-4): it stored state instead of deriving it,
and it compressed the four lifecycles below into one field.

Notation: `State` — *(the event that produces it)*. Branch/terminal states are marked.

---

## Market
- **Defined** — *(Market Defined)*
- **Active** — *(Market Activated)*
- **Retired** *(terminal)* — *(Market Retired)*

## Owner
- **Identified** — *(Owner Identified)*
- **Enriched** — *(Owner Enriched)*
- **Merged / Archived** *(terminal, identity resolution)* — *(Owner merge/archive)*

*(Owner is durable and market-side; its lifecycle is identity, not transaction. Becoming a Seller
is the Seller's birth, not a state of the Owner.)*

## Property
- **Identified** — *(Property Identified)*
- **Enriched** — *(Property Enriched)*
- **Under Contract** — *(Deal Controlled, for a Deal concerning this Property)*
- **Transferred** *(terminal)* — *(Property Transferred)*

## Seller *(born from Owner at Conversation Started)*
- **Engaged** — *(Conversation Started)*
- **Qualified** — *(Seller Qualified)*
- **Nurture** *(branch)* — *(Seller Nurtured)*
- **Disqualified** *(terminal)* — *(Seller Disqualified)*

*A Seller is a relationship: it can move from Engaged to Qualified, drop to Nurture, or end at
Disqualified. It does not carry Opportunity/Deal/Transaction state.*

## Opportunity *(born at Opportunity Created)*
- **Created** — *(Opportunity Created)*
- **Underwritten** — *(Underwriting Completed)*
- **Offered** — *(Offer Submitted)*
- **Accepted** — *(Offer Accepted)* → precursor to a Deal
- **Abandoned** *(terminal)* — *(Offer Rejected / Opportunity Abandoned)*

## Deal *(born from Opportunity at Deal Controlled)*
- **Controlled** — *(Deal Controlled)*
- **Contingencies Cleared** — *(Contingency Cleared)*
- **Matched** — *(Buyer Matched)* → ready for execution
- **Terminated** *(terminal)* — *(Deal Terminated)*

## Transaction *(born from Deal at Transaction Opened)*
- **Opened** — *(Transaction Opened)*
- **In Escrow** — *(Funds Received)*
- **Signed** — *(Documents Signed)*
- **Closed** *(terminal, success)* — *(Transaction Closed / Settlement Completed)*
- **Failed** *(terminal)* — *(Transaction Failed)*

## Buyer *(standing demand, built independently)*
- **Added** — *(Buyer Added)*
- **Qualified** — *(Buyer Qualified)*
- **Interested** — *(Buyer Matched, for a specific Deal)*
- **Committed** — *(Buyer Committed)*

## Revenue *(born from Transaction at Revenue Recognized)*
- **Recognized** — *(Revenue Recognized)*
- **Attributed** — *(Revenue Attributed)*
- **Reconciled** *(terminal)* — *(Revenue Reconciled)*

---

## Why four lifecycles, not one

The old single enum told the business "an opportunity is at stage X" when in truth **four
different objects were each somewhere in their own life.** Separated, each lifecycle is legible on
its own, and the hand-offs between them become explicit object *births*:

```
Seller  ──Opportunity Created──▶  Opportunity  ──Deal Controlled──▶  Deal
   ▲                                                                   │
 (born at Conversation Started, from an Owner)             Transaction Opened
                                                                       ▼
                                        Buyer ──Buyer Matched──▶  Transaction ──Revenue Recognized──▶ Revenue
```

The **people** who drive these transitions — the departments, roles, queues, and SOPs that emit
the events — are defined in **Document 6, the Business Workflow Model.**
