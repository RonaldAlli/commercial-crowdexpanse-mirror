# CrowdExpanse — Change Governance
## How the Constitution and Reference Architecture are changed

> **Status:** DRAFT for founder review (rev. 2026-07-27). Part of the **CrowdExpanse Reference
> Architecture.** An architecture is only as strong as the process that evolves it. This
> document makes that process explicit: **who owns each layer, who may change it, what approval
> is required, how a change is proposed, and when it becomes effective.** Without this, the
> architecture is strong but the process for evolving it is implicit — and implicit process is
> where drift begins.

## Governing principle

The **higher the layer, the slower and more deliberate the change.** Lower layers change to
conform to higher ones; higher layers never change to accommodate lower ones (*Business Models
Software*). A change to a higher layer **may obligate** changes below it. A change below **may
never silently redefine** a layer above it. AI may propose changes to any layer but **approves
none** and **authors no canonical object, event, or state.**

---

## Ownership and change authority (who can change what)

| Layer | Owned by | Change authority | Rate of change |
|---|---|---|---|
| **Constitution** | Business (Founder) | Founder approval only | Almost never |
| **Operating Model** | Business | Business owner | As the company evolves |
| **Domain Model** | Business | Business owner (+ engineering review for representability) | Rare |
| **Capability Map** | Business | Business owner | Rare |
| **Language Specification** | Business | Governance review — **API-grade** (see below) | Deliberate, controlled |
| **Event Vocabulary** | Business | Business owner — **additive by default** | Additive |
| **Lifecycles** | Business | Business owner (state is derived from events) | Moves with the events |
| **Workflows** | Business (department heads) | Department head + business owner | Operational cadence |
| **Platform** | Engineering | Engineering — must conform to the business layers | Continuous |
| **Engineering** | Engineering | Engineering | Continuous |
| **Automation** | Engineering | Engineering | Continuous |
| **AI** | Engineering | Engineering — AI defines nothing canonical | Continuous |

---

## The change process (for any business-layer change)

1. **Propose** — a written change proposal: *what* changes, *why*, which **Business Invariants**
   and **contracts** it touches, and what it **obligates** in the layers below.
2. **Assess impact** — enumerate every affected representation: UI terminology, API terminology,
   database models, reports, dashboards, training, SOPs, documentation, automation, AI prompts —
   plus any Business Invariant affected.
3. **Decide** — the layer's change authority (above) approves or rejects.
4. **Sequence** — if the change opens a gap between the model and the implementation, register a
   **Business Alignment Initiative** (`ALIGNMENT_INITIATIVES.md`). The gap is legitimate and
   tracked; it is not a defect to hide.
5. **Effective** — the change is effective only when it has been **propagated across all affected
   representations**, not at the moment of approval. Until then the change is *declared, not yet
   realized* — a legitimate, explicitly-tracked lag.

---

## Special process — the Business Language Specification (treat it like a public API)

Once the language is frozen, everything downstream freezes with it: UI, API, database, reports,
training, SOPs, documentation, automation, AI prompts. So a word is governed exactly as
engineers govern a public API symbol.

- **Additive is cheap; renaming or redefining is expensive** and always requires governance.
- **Deprecate, don't rename.** Introduce the new term, mark the old one deprecated, migrate every
  representation, *then* retire the old term. Never a silent rename.
- **A single word change carries a propagation checklist:** UI terminology · API terminology ·
  database terminology · report terminology · training · SOPs · documentation · automation ·
  AI prompts. The change is not effective until every box is checked.
- **Nothing enters any representation before it exists in the Specification.** New feature, new
  word? The word is added to the Specification first, then used.

Changing a business word changes the business itself. Slow is correct here.

---

## The No-Synonyms and No-Homonyms Rules

Two rules make the Language Specification **enforceable** rather than merely descriptive. Both
are checked whenever a term is added or changed.

### No-Synonyms Rule — one concept, one canonical word

A business concept has **exactly one canonical term.** Many **aliases** may be *recorded* — for
migration, search, and history — but only the canonical term ever appears in a live
representation (UI, APIs, reports, documentation). **Aliases exist to be mapped, never to be
used.**

> **Example (form only):** concept **Deal** → canonical **"Deal"**; recorded aliases such as
> *Contract* · *Controlled Opportunity* · *Acquisition* exist solely for migration mapping and
> never appear on a live surface.
>
> *Note:* some words that look like aliases — e.g. *"Transaction"* — are in fact their own
> distinct concepts. Telling a true alias apart from a separate concept is exactly what the
> **Language Conflict Report** does before any canonical term is ratified.

### No-Homonyms Rule — one word, one meaning

A single word may denote **exactly one concept.** A word that means two things is prohibited.

> **Example:** if *"Lead"* is used to mean both a *marketing lead* and a *qualified Seller*, that
> is a homonym conflict. It must be resolved by giving each meaning its own canonical word — one
> of the two uses is renamed.

Together these rules guarantee a **bijection between concepts and canonical words**: every
concept has exactly one word, every word has exactly one concept. That bijection is what lets
the Specification act as a **validator** — schema, APIs, UI, reports, and AI prompts can each be
checked against it and returned PASS or CONFLICT. (The active tooling — a Language Validator and
a Business Compliance Report — is planned, not built now.)

---

## Events are immutable

A canonical business event, once defined and emitted, is **never edited or deleted** — business
history is append-only. Correcting the *meaning* of an event is a **new event definition plus a
migration**, never a mutation of the old one. Lifecycle state is always **derived** from this
event history and is never hand-set. (This mirrors the platform's existing provenance ledger and
fact-based pipeline, which already reconstruct state from immutable facts.)

---

## When changes become effective

| Change to… | Effective when… |
|---|---|
| Constitution / Domain / Capability | approved by the business; obligations below are tracked as Alignment Initiatives |
| Language Specification | the propagation checklist is complete across all representations |
| Event Vocabulary | the new definition is deployed; **prior definitions remain valid history** |
| Platform / Engineering / Automation / AI | on deploy — and only if they conform to the business layers as of that date |

---

> **Governance is what turns a set of documents into a living architecture.** With it, the
> model and the implementation can each evolve on their own cadence without drifting apart.
> Without it, the architecture drifts from reality the first time someone edits a word in a
> hurry.
