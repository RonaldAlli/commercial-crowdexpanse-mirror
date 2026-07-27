# CrowdExpanse — Architecture Map
## The one-page map of the entire business stack

> **Status:** Business Architecture **v1.0 — Frozen 2026-07-27** (`REFERENCE_ARCHITECTURE_v1.0.md`).
> Part of the **CrowdExpanse Reference Architecture.** This is the index to the whole architecture —
> not a document layer itself,
> but the single picture that shows where every document, layer, and system fits.

> **What CrowdExpanse is:** The *company* is a **commercial real-estate acquisition company.**
> The *platform* is a **Commercial Acquisition Intelligence Platform** — its purpose is to
> convert **Market Intelligence**, **Supply Intelligence**, and **Demand Intelligence** into
> **profitable transactions.** "Intelligence" here is architectural, not a reference to AI: it
> is the three forms of knowledge that constitute the company's moat.

> **How the collection is organized:** the **Constitution** stands above and governs the
> **Reference Architecture** (Operating Model · Domain Model · Capability Map · Language
> Specification · Event Vocabulary · Lifecycles · Workflows · this Architecture Map). Beneath
> those sit the Platform Blueprint, Engineering, Automation, and AI. **CAOS** — the Commercial
> Acquisition Operating System — is the operating business those documents describe; the
> Reference Architecture is how CAOS is written down.

---

## The Stack

Each layer serves the one above it. Higher layers are more stable. **The business owns the
top; engineering owns the bottom; AI owns nothing.**

```
                        REALITY
        commercial real estate as it actually is — we observe it
                           │
                       MANIFESTO             ── why CrowdExpanse exists (5-min read)
                           │
                      CONSTITUTION            ── Document 0  (almost never changes)
        purpose · principles · authority · the governing test
                           │
                     OPERATING MODEL          ── Document 1
        revenue · departments · services · acquisition · scaling
                           │
                    BUSINESS DOMAIN           ── Document 2
        the objects, why each exists, and how they relate
                           │
                  BUSINESS CAPABILITIES       ── Document 2.5
        what the company must be ABLE to do (stable)
                           │
                    BUSINESS LANGUAGE         ── Document 3  (governed like an API contract)
        the single authoritative name for everything
                           │
                    BUSINESS EVENTS           ── Document 4  (immutable — the source of truth)
        what can happen
                           │
                  BUSINESS LIFECYCLES         ── Document 5
        how each object evolves (state DERIVED from events)
                           │
                  BUSINESS WORKFLOWS          ── Document 6
        how departments consume objects and produce events
        ══════════════════ the line between business and software ══════════════════
                           │
                        PLATFORM
        the screens, APIs, forms, and reports that support capabilities
                           │
                       ENGINEERING
        how the platform is built — testing · CI · deploy · security
                           │
                       AUTOMATION
        deterministic execution — rules · schedulers · routing
                           │
                           AI
        intelligent assistance — reads every layer above, defines none
```

---

## Every layer is a contract

Each layer is not merely a description — it is a **contract between two parties.** One party
declares what is true; the other is bound to honor it. This is why the stack is stable: a
contract can only be changed through governance (`CHANGE_GOVERNANCE.md`), never by convenience
from below.

| Layer | Contract between | … and |
|---|---|---|
| **Constitution** | the Business | everything else |
| **Operating Model** | the Business | its Operations |
| **Domain Model** | the Business | Engineering |
| **Capability Map** | the Mission | the Organization |
| **Language Specification** | People | Software |
| **Event Vocabulary** | Reality | the System |
| **Lifecycles** | Events | Workflow |
| **Workflows** | Departments | the Platform |
| **Platform** | the Business | Engineering |
| **Engineering** | Architecture | Implementation |
| **Automation** | Implementation | Execution |
| **AI** | Knowledge | Assistance |

Read top to bottom, the contracts form one chain: the Business tells Reality's truth to
Engineering, in a shared Language, through immutable Events, which drive Lifecycles, which
departments execute as Workflows, which the Platform supports, which Engineering builds,
which Automation executes, which AI assists. Break any one contract and the chain breaks.

---

## Who owns what (the Business Authority Rule, applied)

| Layer range | Owner | Authority |
|---|---|---|
| Reality → Workflows | **The Business** | Defines Domain, Language, Events, Lifecycles, Workflows |
| Platform → Automation | **Engineering** | Owns implementation, performance, reliability, security |
| AI | **No one — AI assists** | May read every layer; may author no canonical object, event, or state |

The double line marks the **seam between the business and its software.** Everything above it
is what is true. Everything below it is how that truth is served. When the two disagree, the
layer above is authoritative and the layer below is corrected.

---

## The three intelligences (the moat, mapped through the stack)

```
   MARKET INTELLIGENCE ─┐
   SUPPLY INTELLIGENCE ─┼─▶  controlled opportunities  ─▶  matched demand  ─▶  TRANSACTION  ─▶  REVENUE
   DEMAND INTELLIGENCE ─┘
```

The platform exists to convert these three forms of intelligence into profitable
transactions. Every capability, screen, automation, and AI feature is judged by whether it
does that better (the **Governing Test**).

---

## Document index

| Group | Document | File | Status |
|---|---|---|---|
| — | Manifesto | `MANIFESTO.md` | ✅ v1.0 |
| — | Constitution | `0_CONSTITUTION.md` | ✅ v1.0 |
| Reference Architecture | Operating Model | `1_OPERATING_MODEL.md` | ✅ v1.0 |
| Reference Architecture | Domain Model | `2_DOMAIN_MODEL.md` | ✅ v1.0 |
| Reference Architecture | Capability Map | `2_5_CAPABILITY_MAP.md` | ✅ v1.0 |
| Reference Architecture | Language Specification | `3_LANGUAGE_SPECIFICATION.md` | ✅ v1.0 (ratified) |
| Reference Architecture | Event Vocabulary | `4_EVENT_VOCABULARY.md` | ✅ v1.0 |
| Reference Architecture | Lifecycle Model | `5_LIFECYCLE_MODEL.md` | ✅ v1.0 |
| Reference Architecture | Workflow Model | `6_WORKFLOW_MODEL.md` | ✅ v1.0 |
| Reference Architecture | Architecture Map | `ARCHITECTURE_MAP.md` | ✅ v1.0 (this document) |
| Governance | Change Governance | `CHANGE_GOVERNANCE.md` | ✅ v1.0 |
| Baseline record | Reference Architecture v1.0 | `REFERENCE_ARCHITECTURE_v1.0.md` | ✅ frozen |
| Living | Language Conflict Report | `LANGUAGE_CONFLICT_REPORT.md` | ✅ ratified |
| Living | Business Evolution Initiatives | `ALIGNMENT_INITIATIVES.md` | ✅ BE-1…BE-5 |
| Living | Platform Mapping | `PLATFORM_MAPPING.md` | ✅ draft |
| Living | Business Alignment Dashboard | `BUSINESS_ALIGNMENT_DASHBOARD.md` | ✅ baseline |
