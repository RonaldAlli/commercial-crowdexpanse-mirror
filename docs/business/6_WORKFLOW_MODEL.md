# CrowdExpanse — Business Workflow Model
## CrowdExpanse Reference Architecture — Document 6

> **Status:** DRAFT for founder review (rev. 2026-07-27). Obeys everything above it, and is the
> **last foundational document** — the point where the architecture finally touches how people
> actually work. It answers:
>
> **How do people perform work?**

Where Document 5 was object-centric and people-free, this document is the opposite: it is entirely
about **people** — departments, roles, hand-offs, queues, SOPs, and KPIs. A workflow exists only
because people do work; it changes at an operational cadence, far faster than a lifecycle. That is
why it is a separate document.

## The two rules that bind workflows to the architecture above

- **Workflows produce events; events drive lifecycles.** People never set a state directly. They
  *do work*, which *emits an event* (Document 4), which *derives a state* (Document 5). This keeps
  the operator's daily reality and the business's recorded truth in one honest chain.
- **Business First.** Every workflow must be fully executable by trained staff **without AI**
  (Constitution). Automation and AI accelerate a workflow; they are never required for it to run.

Each workflow below states: the **capability** it enacts (Document 2.5), the **department/role**
that owns it, the **objects** it consumes, the **events** it produces, the **hand-off** to the next
workflow, and its **KPI.**

---

## Market Selection
- **Capability:** Market Intelligence · **Owner:** Market Research / Management
- **Consumes:** market criteria · **Produces:** `Market Defined`, `Market Activated`
- **Hand-off:** an active Market → Supply Sourcing
- **KPI:** markets defined · market score · capital deployed per market

## Supply Sourcing & Outreach
- **Capability:** Supply Intelligence · **Owner:** Acquisitions
- **Consumes:** Owners within a Market · **Produces:** `Conversation Started` (creates the Seller), `Seller Qualified`
- **Queue:** the acquisition/outreach queue (the operator's daily list)
- **Hand-off:** a Qualified Seller → Opportunity Creation
- **KPI:** contact rate · qualification rate · **closings-per-source** (by seller-source tier)

## Underwriting
- **Capability:** Opportunity Management · **Owner:** Underwriting (analyst)
- **Consumes:** Opportunities · **Produces:** `Underwriting Completed`, `Offer Prepared`
- **Hand-off:** a priced Opportunity → Negotiation
- **KPI:** underwrite throughput · offer rate · deal-quality distribution

## Negotiation & Control
- **Capability:** Opportunity Management → Deal Control · **Owner:** Acquisitions
- **Consumes:** underwritten Opportunities · **Produces:** `Offer Submitted`, `Offer Accepted`, `Deal Controlled` (creates the Deal)
- **Hand-off:** a controlled Deal → Disposition + Closing
- **KPI:** offer→acceptance rate · acceptance→control rate

## Demand Building & Matching
- **Capability:** Demand Intelligence · **Owner:** Disposition
- **Consumes:** Buyers (built continuously) + controlled Deals · **Produces:** `Buyer Added`, `Buyer Qualified`, `Buyer Matched`
- **Hand-off:** a matched Deal → Closing
- **KPI:** buyer inventory size · buy-box coverage · match rate

## Closing (Transaction Execution)
- **Capability:** Transaction Execution · **Owner:** Transaction Coordination
- **Consumes:** matched Deals · **Produces:** `Transaction Opened`, `Funds Received`, `Documents Signed`, `Transaction Closed`
- **Hand-off:** a closed Transaction → Finance
- **KPI:** close rate · days-to-close · fallout rate

## Revenue & Attribution
- **Capability:** Business Intelligence · **Owner:** Finance
- **Consumes:** closed Transactions · **Produces:** `Revenue Recognized`, `Revenue Attributed`, `Revenue Reconciled`
- **Hand-off:** attributed revenue → Management (steering the next Market Selection)
- **KPI:** revenue · fee realized · **ROI by acquisition channel**

---

## Hand-offs form one operating loop

The workflows chain into a loop, and its output steers its own input — attribution tells Market
Selection where to look next:

```
Market Selection → Supply Sourcing → Underwriting → Negotiation & Control
      ▲                                                        │
      │                                                        ▼
Revenue & Attribution ← Closing ← Demand Building & Matching ──┘
```

Every hand-off is a place where one workflow's **event** becomes the next workflow's **input** — and
because state is derived from those events, every department sees the same truth without anyone
re-keying it. **Departments, queues, and SOPs may be reorganized freely** (Change Governance,
operational cadence) **as long as the events they produce stay faithful to Document 4.**

---

*The Reference Architecture is now complete: Constitution → Operating Model → Domain → Capabilities
→ Language → Events → Lifecycles → Workflows. The next step is not another document — it is to
**map the existing platform** against this architecture (`PLATFORM_MAPPING.md`).*
