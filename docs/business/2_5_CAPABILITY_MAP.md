# CrowdExpanse — Business Capability Map
## CrowdExpanse Reference Architecture — Document 2.5

> **Status:** DRAFT for founder review (rev. 2026-07-27). Sits between **Document 2 (Domain
> Model)** and **Document 3 (Language Specification)** and obeys the Constitution.

This document answers one question:

> **What capabilities must the company possess to fulfill its mission?**

A **capability** is something the company must be *able to do*. It is not a department, not a
screen, and not a piece of software. This distinction is the whole point of the document:

- **Departments change.** Capabilities don't.
- **Software changes.** Capabilities don't.
- **AI changes.** Capabilities don't.

So the three rules that bind this layer to everything below it are:

> **Departments use capabilities. Software supports capabilities. AI enhances capabilities.**

### Why this keeps the business independent of technology

- You do not hire someone into a *"Seller Workspace."* You hire them into **Supply
  Intelligence**.
- You do not buy *"a CRM."* You buy **a capability that supports Supply Intelligence**.
- You do not build *"a Deal module."* You strengthen the company's **Deal Control** capability.

Capabilities are how the business talks about itself independently of whatever tools happen to
exist this year. Every screen, API, automation, and AI feature is judged by *which capability
it supports and how well* — never by whether it is "a feature."

---

## The Capability Domains

Seven capability domains fulfill the mission. The first three are the company's three
**intelligences** (the moat); the next three **act on** that intelligence to control and
execute; the last **measures** the whole system.

### 1. Market Intelligence
*Knowing where opportunity is most likely to emerge.*
- Market selection
- Market scoring
- Territory management

*Operates on:* **Market.** *Serves:* the Market inventory.

### 2. Supply Intelligence
*Knowing which owners and properties are most likely to transact.*
- Owner discovery
- Property discovery
- Contact enrichment
- Seller qualification

*Operates on:* **Owner · Property · Seller.** *Serves:* the Supply inventory (the competitive core).

### 3. Demand Intelligence
*Knowing which buyers, lenders, and operators can execute.*
- Buyer acquisition
- Buyer qualification
- Buy boxes
- Capital partners

*Operates on:* **Buyer.** *Serves:* the Demand inventory.

### 4. Opportunity Management
*Turning a relationship into a priced, offerable opportunity.*
- Qualification
- Underwriting
- Offer preparation
- Negotiation

*Operates on:* **Opportunity.**

### 5. Deal Control
*Obtaining and holding legal control, with its rights and obligations.*
- Contract management
- Earnest money
- Contingencies
- Due diligence

*Operates on:* **Deal.**

### 6. Transaction Execution
*Converting a controlled deal into a completed exchange.*
- Closing
- Assignment
- Escrow
- Financing

*Operates on:* **Transaction.**

### 7. Business Intelligence
*Knowing how the whole system is performing.*
- KPIs
- Reporting
- Forecasting
- Performance

*Operates on:* every object's authoritative facts (never on display strings).

---

## How the layers connect

```
Business Capability   (stable — what the company must be able to do)
        ▲
        │ uses
   Department          (mutable — how the company is organized to do it)
        ▲
        │ supported by
     Platform          (mutable — the software that supports the capability)
        ▲
        │ enhanced by
   Automation & AI     (mutable — accelerants; never the capability itself)
```

A department is a *current arrangement* of people around capabilities. Software is a *current
tool* that supports a capability. Automation and AI are *current accelerants*. All three can
be reorganized, replaced, or removed without changing what the company must be able to do.

*Next in the set: **Document 3 — Business Language Specification.***
