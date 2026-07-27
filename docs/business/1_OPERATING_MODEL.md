# CrowdExpanse — Operating Model
## CrowdExpanse Reference Architecture — Document 1

> **Status:** DRAFT for founder review (rev. 2026-07-27). This document explains **how the
> company works** and is expected to change as the company grows. It sits beneath — and must
> always obey — **Document 0, the Constitution.** Where this document and the Constitution
> disagree, the Constitution wins.
>
> Read the Constitution first: it fixes the purpose, the three inventories, the founding
> principles, the Business Authority Rule, and the governing test. This document assumes them.

---

## How the company creates value

CrowdExpanse runs one repeatable value chain and monetizes controlled opportunities through
several exit strategies:

```
Select a MARKET  →  generate SUPPLY (owners → conversations → sellers → opportunities)
      →  obtain legal control (DEAL)  →  match to DEMAND (buyers/capital)
      →  execute the TRANSACTION  →  realize REVENUE
```

Each stage is a standardized business process that trained staff can execute without AI.
The platform supports the process; automation and AI accelerate it.

---

## Revenue model

**Primary revenue** — from controlling and transacting opportunities. The business is paid
when it controls a **Deal**, not merely when an Opportunity exists:

- Wholesale assignment fees
- Double-close profits
- Acquisition fees
- Joint-venture fees
- Equity participation

**Secondary revenue** — from the platform and the inventories/intelligence themselves:

- Buyer matching
- Deal packaging
- Consulting / advisory
- Software subscriptions
- Premium market intelligence
- Enterprise licensing *(future)*

The primary revenue lines are the business. The secondary lines monetize assets the business
already produces (its inventories and its intelligence) and are pursued only when they do not
distract from acquisition.

---

## Core services

| Service | What it does |
|---|---|
| **Acquisition Services** | Seller sourcing · seller qualification · opportunity creation |
| **Financial Services** | Underwriting · deal analysis · pricing support |
| **Transaction Services** | Due diligence · buyer matching · closing coordination |
| **Technology Services** | Workflow platform · reporting · automation · analytics |

---

## Departments and hand-offs

Departments **consume business objects and produce business events.** Each owns a stage of
the value chain and hands a well-defined object to the next. The authoritative per-object
lifecycles and the full hand-off contracts live in **Document 5 — Business Lifecycle &
Workflow Model**; this is the operating overview.

| Department | Consumes | Produces | Hands off |
|---|---|---|---|
| **Market Research** | market criteria | a defined **Market** + target owner profile | Markets → Acquisitions |
| **Acquisitions** | Owners in a Market | **Sellers** (relationships), **Opportunities** | qualified Opportunities → Underwriting |
| **Underwriting** | Opportunities | analysis, pricing, offer terms | approved offers → Acquisitions to submit |
| **Transaction / Closing** | **Deals** (controlled opportunities) | due diligence, escrow, closing | closed Deals → Accounting |
| **Disposition** | Deals + **Buyer** inventory | buyer matches, assignments | matched buyers → Closing |
| **Accounting** | closed Transactions | **Revenue** recognition, ROI | reporting → Management |

The hand-offs are the seams where one department's output becomes another's input. Getting
the object definitions (Document 3 Domain) and the events (Document 4) right is what lets
these hand-offs be clean rather than tribal knowledge.

---

## The acquisition model (the funnel)

Acquisition is a funnel from broad market attention to a small number of executed
transactions. Interest is not control; only a **Deal** is control, and the business is paid
at the Deal. Illustrative shape of one market cycle:

```
10,000 Opportunities  (potential acquisitions in the Market)
→   300 Qualified     (a Seller relationship + real motivation)
→    40 Underwritten  (analyzed, priced)
→    10 Offers        (terms submitted)
→     4 Deals         (legal control obtained)
→     3 Closed        (Transaction executed → Revenue)
```

The scarce resource is not attention at the top of the funnel — it is **motivated supply**
and the **intelligence** to identify it. Improving conversion between any two stages is worth
more than adding volume at the top.

---

## Scaling

The company is designed to scale by **process, not by heroics.** Because every workflow is
executable by trained staff without AI (Business First), growth is a matter of:

- **More markets** — the Market entity is the unit of expansion; a new market is a new
  instance of the same process, not a new process.
- **More trained operators** — standardized SOPs and one shared language mean a new hire
  runs the same play as a veteran.
- **More intelligence** — as the three intelligences (Market/Supply/Demand) accumulate,
  conversion improves without more headcount.
- **More automation, then AI** — deterministic automation removes repetitive work from
  proven workflows; AI is added last, as an accelerant, never as a dependency.

The platform's job in scaling is to make the standardized process the *path of least
resistance*, so doing it the right way is also the easy way.

---

## Business objects (operating roster)

These are the nouns the whole company shares — used identically by Management, Acquisitions,
Underwriting, Transaction, Accounting, Engineering, and AI. The **authoritative** definitions,
the reason each exists, their kinds, and their relationships are specified in **Document 2 —
Business Domain Model.** This is the operating summary.

| Object | Kind | One-line role in operations |
|---|---|---|
| **Market** | Entity (container) | where we choose to deploy attention and capital; the source of all supply |
| **Owner** | Entity | the legal owner of property; exists whether or not we know them |
| **Property** | Entity | the physical asset; real and independent of us |
| **Buyer** | Entity | standing demand inventory, built continuously from day one |
| **Seller** | Relationship | an acquisition relationship, born when an Owner enters a conversation |
| **Opportunity** | Business construct | a potential acquisition we are working |
| **Deal** | Legal construct | an Opportunity over which we have obtained contractual/legal control |
| **Transaction** | Execution process | the execution that converts a controlled Deal into revenue |
| **Revenue** | Outcome | the business is paid |

Two operating distinctions the business depends on (formalized in Document 2):

- **Owner ≠ Seller.** An Owner exists in the Market whether or not we ever speak to them. A
  **Seller** is a **business relationship** that comes into being only when an Owner (or an
  authorized decision-maker) enters an acquisition conversation: `Owner → conversation →
  Seller`.
- **Opportunity ≠ Deal.** An **Opportunity** is a potential acquisition not yet legally
  controlled. A **Deal** is an Opportunity over which we have obtained contractual or legal
  control — carrying rights, deadlines, earnest money, contingencies, and obligations an
  Opportunity does not. The business is paid at the Deal.

---

*Next in the set: **Document 2 — Business Domain Model** (why each object exists, its kind,
and the structural vs. business relationships among them).*
