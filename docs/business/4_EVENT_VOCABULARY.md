# CrowdExpanse — Business Event Vocabulary
## CrowdExpanse Reference Architecture — Document 4

> **Status:** DRAFT for founder review (rev. 2026-07-27). Sits beneath the Constitution and
> obeys the Domain Model (Document 2) and the Language Specification (Document 3). It answers the
> question Document 4 exists to answer:
>
> **What business truths are permanently recorded?**

This is **not a technical event log.** Like Document 2 defined objects by *why they exist*, this
document defines events by *why they must exist* — the business meaning first, the implementation
never. Events are the layer where reality becomes history: everything above (Domain, Language) is
what *is*; events are what *happened*; lifecycles and reports are *derived* from them.

## Why events are the source of truth

The Constitution fixes two principles that make events primary:

- **Events are immutable** — once recorded, a business truth is never edited or deleted.
- **State is derived from events** — no object's lifecycle state is ever hand-set; it is computed
  from the events that have occurred.

Therefore the Event Vocabulary is the **contract between Reality and the System** (see the
Architecture Map). Get the events right and every lifecycle, report, forecast, and audit is a
*consequence*; get them wrong and nothing below can be trusted.

## The event template

Every canonical event answers five questions — the same discipline as the object template:

1. **Why must this event exist?** — the business reason, not the trigger.
2. **Who emits it?** — the capability, department, or actor that declares it true.
3. **Who consumes it?** — the lifecycles, reports, and downstream events that depend on it.
4. **Can it ever change?** — immutability and correction rules.
5. **What business truth does it record?** — the fact it makes permanent.

## Global rules for every event

- **Past tense, always.** An event names something that *happened* (`Deal Controlled`), never a
  state (`Under Contract`) or an intention.
- **Immutable and append-only.** No event is edited or deleted. A mistake is corrected by a **new**
  event (`Corrected`, `Retracted`) plus a migration — never by mutating the original (Change
  Governance).
- **One event, one truth.** An event records exactly one business fact and names exactly one thing
  that occurred (No-Homonyms applies to event names too).
- **Emitted by an accountable actor.** Every event carries who declared it — human, deterministic
  evaluator, external principal, or migration principal — so history is attributable.
- **Grounded in the ledger.** These map onto the platform's existing append-only fact ledger
  (`PipelineFact`, provenance `VERIFIED`) — the engine for this pattern already exists; this
  document is its **business** definition.

---

## The pivotal events (full template)

These are the events the business is measured by — each creates an object or transitions one
across a meaningful boundary.

### Market Defined
1. **Why:** the company cannot source supply without first deciding where to deploy attention and capital.
2. **Emits:** Market Research / Management.
3. **Consumes:** the Market lifecycle (activates it); all supply attribution traces back to it.
4. **Change:** immutable; a changed thesis is a new `Market Thesis Updated` event, not an edit.
5. **Records:** *a defined arena of investment now exists.*

### Conversation Started
1. **Why:** an Owner only becomes actionable when a relationship begins — this event **creates the Seller.**
2. **Emits:** Acquisitions.
3. **Consumes:** the Seller lifecycle (births it from the Owner); Supply Intelligence.
4. **Change:** immutable.
5. **Records:** *an Owner has entered an acquisition conversation — a Seller relationship now exists.* (`Owner → conversation → Seller`.)

### Seller Qualified
1. **Why:** the business must distinguish a real acquisition relationship from mere contact, to focus effort.
2. **Emits:** Acquisitions.
3. **Consumes:** the Seller lifecycle; conversion reporting; readiness to create an Opportunity.
4. **Change:** immutable; a later disqualification is a separate `Seller Disqualified` event.
5. **Records:** *this Seller has real motivation and fit.*

### Opportunity Created
1. **Why:** a qualified relationship becomes a potential acquisition the business actively works — but interest is not control.
2. **Emits:** Acquisitions.
3. **Consumes:** the Opportunity lifecycle (starts it); the funnel/pipeline reports.
4. **Change:** immutable.
5. **Records:** *a potential acquisition now exists, not yet controlled.*

### Underwriting Completed
1. **Why:** the business must not offer on an un-analyzed opportunity; this is the decision gate before an offer.
2. **Emits:** Underwriting (a deterministic evaluator may assist; a human decides).
3. **Consumes:** the Opportunity lifecycle; offer preparation; deal-quality reporting.
4. **Change:** immutable; re-underwriting emits a new event referencing the prior.
5. **Records:** *this Opportunity has been analyzed and priced.*

### Offer Accepted
1. **Why:** an accepted offer is the immediate precursor to legal control; the funnel narrows sharply here.
2. **Emits:** Acquisitions (recording the Seller's acceptance).
3. **Consumes:** the Opportunity lifecycle; sets up `Deal Controlled`.
4. **Change:** immutable; a fallen-through acceptance is a separate event.
5. **Records:** *the Seller has accepted our offer terms.*

### Deal Controlled
1. **Why:** legal control changes everything — rights, obligations, deadlines, earnest money. **This event creates the Deal.**
2. **Emits:** Transaction Coordination (on executed contract).
3. **Consumes:** the Deal lifecycle (births it from the Opportunity); disposition/matching; the "controlled" metric.
4. **Change:** immutable; termination is a separate `Deal Terminated` event.
5. **Records:** *we have obtained contractual/legal control of the Opportunity — a Deal now exists.* (`Opportunity → control → Deal`.)

### Buyer Matched
1. **Why:** a controlled Deal has no value until paired with demand able to execute.
2. **Emits:** Disposition.
3. **Consumes:** the Deal lifecycle; the Buyer lifecycle; sets up the Transaction.
4. **Change:** immutable; a declined match is a separate event.
5. **Records:** *this Deal has been matched to a Buyer.* ("Match" = Buyer ↔ Deal only.)

### Transaction Opened
1. **Why:** holding control is not completing the exchange; execution is its own process with its own money and steps. **This event creates the Transaction.**
2. **Emits:** Transaction Coordination.
3. **Consumes:** the Transaction lifecycle (births it from the Deal); escrow/financing/closing.
4. **Change:** immutable.
5. **Records:** *execution of a controlled Deal has begun.* (`Deal → creates → Transaction`.)

### Transaction Closed
1. **Why:** the business must know the exchange completed — the point at which revenue becomes real.
2. **Emits:** Transaction Coordination.
3. **Consumes:** the Transaction lifecycle; triggers `Revenue Recognized`.
4. **Change:** immutable; a failed close is a separate `Transaction Failed` event.
5. **Records:** *the exchange of property and consideration has completed.*

### Revenue Recognized
1. **Why:** the business must record what it earned and be able to attribute it to its source.
2. **Emits:** Finance.
3. **Consumes:** the Revenue lifecycle; BI (from authoritative facts, never display strings); Attribution.
4. **Change:** immutable; reconciliation/attribution are separate events.
5. **Records:** *the business has earned revenue from a completed Transaction.* (`Transaction → creates → Revenue`.)

---

## The supporting events (by lifecycle)

Full template omitted for brevity; each obeys the global rules and records one truth.

| Lifecycle | Supporting events | Each records… |
|---|---|---|
| **Market** | Market Thesis Updated · Market Activated · Market Retired | a change to where/how we deploy capital |
| **Owner / Property** | Owner Identified · Owner Enriched · Property Identified · Property Enriched · Ownership Recorded | discovery and enrichment of supply-side facts |
| **Seller** | Seller Engaged · Motivation Captured · Seller Disqualified · Seller Nurtured | progression (or exit) of the relationship |
| **Opportunity** | Financials Received · Offer Prepared · Offer Submitted · Offer Rejected · Opportunity Abandoned | working the potential acquisition |
| **Deal** | Earnest Money Deposited · Contingency Cleared · Deal Terminated | changes to a controlled Deal's rights/obligations |
| **Buyer** | Buyer Added · Buyer Qualified · Buyer Committed | building and committing standing demand |
| **Transaction** | Funds Received · Documents Signed · Settlement Completed · Transaction Failed | steps of the execution process |
| **Revenue** | Revenue Attributed · Revenue Reconciled | attribution and reconciliation of earnings |

*(Correction events — `Corrected`, `Retracted` — apply across all lifecycles per the global rules.)*

---

## Events, lifecycles, and the retirement of the single enum

Because **state is derived from events, each object's lifecycle is a projection of its own events**
— which is precisely why the old 13-value `OpportunityStage` (four lifecycles compressed into one
mutable field) is being retired to a compatibility layer (Business Evolution Initiative BE-4). The
mapping the harvest revealed becomes clean once events own the truth:

```
Conversation Started · Seller Qualified            → Seller lifecycle state
Opportunity Created · Underwriting Completed · Offer Accepted → Opportunity lifecycle state
Deal Controlled · Contingency Cleared              → Deal lifecycle state
Transaction Opened · Transaction Closed            → Transaction lifecycle state
Revenue Recognized                                 → Revenue lifecycle state
```

**Document 5 — Business Lifecycle & Workflow Model** turns each column into an explicit, event-derived
lifecycle, and defines the department workflows that emit these events.
