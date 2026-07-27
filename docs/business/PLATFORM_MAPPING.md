# CrowdExpanse — Platform Mapping
## Where the Reference Architecture meets the application

> **Status:** DRAFT for founder review (rev. 2026-07-27). This is **not architecture and not a
> build plan** — it is a *mapping*. For every existing platform module it asks: which **business
> object**, **lifecycle**, and **workflow** does this faithfully represent? The guiding question
> from here on is:
>
> **"Which business object, lifecycle, capability, or workflow still lacks a faithful
> representation?"**

**Status legend:** ✅ faithful representation exists · 🟡 partial — needs alignment · ❌ missing.

---

## Module → Architecture mapping

| Existing module | Business object | Lifecycle | Workflow | Status | Note |
|---|---|---|---|---|---|
| **Markets** *(none)* | Market | Market | Market Selection | ❌ | Market is not a first-class object — **BE-1** |
| **Owners** | Owner | Owner | Supply Sourcing | ✅ | canonical title-holder (v1.2), distinct from Seller |
| **Properties** | Property | Property | Supply Sourcing | ✅ | deterministic identity + crosswalk |
| **Sellers / Acquire (queue + cockpit)** | Seller | Seller | Supply Sourcing & Outreach | ✅ | relationship + outreach; caveat: row also holds lead state |
| **Contacts** | Owner/Seller contacts | — | Outreach (support) | ✅ | supporting surface |
| **Pipeline** (`/opportunities`) | Opportunity | Opportunity | Underwriting → Negotiation | 🟡 | carries the conflated 13-stage enum — **BE-4** |
| **Deal Analyzer / Underwriting / Offer Memo** | Opportunity | Opportunity | Underwriting | ✅ | deterministic kernel; offer memo from a locked scenario |
| **Deal Workspace** *(none)* | Deal | Deal | Negotiation & Control | ❌ | Deal is not first-class; "control" is a stage value — **BE-2** |
| **Buyers / Matches** | Buyer + Deal | Buyer | Demand Building & Matching | 🟡 | matching keyed to Opportunity, not Deal; dedupe mislabeled "match" — **BE-2, BE-3** |
| **Closing Center** (Escrow / Financing / Assignment / Checklist, "Transaction dashboard") | Transaction | Transaction | Closing | 🟡 | execution records exist but with **no first-class Transaction/Deal parent** — **BE-5** |
| **Communications Desk** (SMS / voice) | Seller / Buyer | multiple | Outreach | 🟡 | operator surface built; providers inert until creds set |
| **Revenue / BI** (`lib/business-intelligence`) | Revenue | Revenue | Revenue & Attribution | 🟡 | derived from authoritative facts; **no first-class Revenue object** |
| **Dashboard / Insights** | (cross-cutting) | — | Business Intelligence | ✅ | consumers of facts, not owners of state |
| **Opportunity Pipeline** (fact projection / `PipelineFact` + `StageSpine`) | Opportunity/Deal/Transaction | the event-derived lifecycles | — | 🟡 | **this is the event-sourcing engine** the architecture wants; deployed-but-dormant — **BE-4** |
| **AI Copilot** | (cross-cutting assist) | — | all | ✅ | Slice 1 read/draft only; assists, defines nothing (Constitution-compliant) |
| **Automation spine** (V2.0.1) | (cross-cutting) | — | automation | 🟡 | spine present; executor off (business-driven activation) |
| **Settings / AI admin / governance** | (platform) | — | — | ✅ | platform governance surface |

---

## What the mapping reveals

Every 🟡 and ❌ traces to a **Business Evolution Initiative** already on the roadmap — the mapping
and the initiatives agree, which is the sign the architecture is internally consistent:

- **Market (❌) → BE-1.** The first entity has no module; all supply is currently unattributable to a Market.
- **Deal (❌) → BE-2.** No Deal Workspace because there is no Deal object; control lives as an Opportunity stage.
- **Language (🟡) → BE-3.** "Match" (dedupe), "Lead", `Task.ownerId`, free-text `source` still violate the ratified vocabulary.
- **Events / one-enum (🟡) → BE-4.** The event-derived engine exists (`PipelineFact`) but coexists with the mutable enum instead of superseding it.
- **Transaction (🟡) → BE-5.** Closing records exist but without a Transaction parent; execution is not separated from ownership.

## The workspaces the architecture implies

Because every workspace now exists to serve a business object + lifecycle + workflow, the surface
stops being arbitrary. The target set:

| Workspace | Serves object | Serves lifecycle | Serves workflow | Today |
|---|---|---|---|---|
| Market Workspace | Market | Market | Market Intelligence | ❌ (BE-1) |
| Seller Workspace | Seller | Seller | Supply Intelligence | ✅ |
| Opportunity Workspace | Opportunity | Opportunity | Underwriting | ✅ |
| Deal Workspace | Deal | Deal | Negotiation | ❌ (BE-2) |
| Transaction Workspace | Transaction | Transaction | Closing | 🟡 (BE-5) |
| Buyer Workspace | Buyer | Buyer | Demand Intelligence | 🟡 |

---

## The shift this mapping records

CrowdExpanse began this work looking like *a collection of excellent software modules.* It now
looks like *a business architecture that software happens to implement.* From here, the platform
grows by answering one question for each proposed screen — **"which object, lifecycle, capability,
or workflow still lacks a faithful representation?"** — rather than "what screen should we build?"
That question is what will keep the platform internally consistent for years.
