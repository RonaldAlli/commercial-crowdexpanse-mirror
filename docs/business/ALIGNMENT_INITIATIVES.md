# CrowdExpanse — Business Evolution Initiatives
## The bridge from the business architecture to engineering

> **Status:** DRAFT for founder review (rev. 2026-07-27, BE-5 authorized). Formerly "Alignment
> Initiatives." Derived from Documents 2–3 and the Language Conflict Report. These are **not a
> technical-debt list** — each initiative introduces a **business concept or governance
> capability** that the architecture now requires. They are **milestones in the evolution of the
> business**, and engineering *aligns implementation with them.*
>
> *(Identifier: `BE-n` = Business Evolution Initiative n.)*

## The framing that matters

A constitution **leads** implementation; it does not merely describe it. When the architecture
declares a first-class Market, Deal, or Transaction, that is a **target the platform moves
toward.** Engineering is not inventing features — it is **aligning implementation with the
business architecture.** A roadmap item does not read "build the Deal module." It reads:

> **Align implementation with the Business Domain:**
> ✓ Introduce the Deal aggregate  ✓ Re-parent escrow  ✓ Re-parent financing
> ✓ Re-parent assignments  ✓ Update workflows  ✓ Update reports

Each initiative states what the **model** says, what the **implementation** does today, and the
**alignment** required. Priority follows business leverage, not technical convenience.

---

## BE-1 — Market becomes a first-class domain object

- **Model says:** Market is the first entity; all supply is generated from a Market; every
  Property exists inside exactly one Market *(Invariant 1)*.
- **Today:** Market is context, not an entity; the word appears only as a display label.
- **Alignment:** introduce the Market aggregate (geography · asset class · thesis · strategy ·
  target owner profile · investment criteria); attribute Properties and sourced supply to a
  Market; unlock Market Intelligence (selection · scoring · territory).

## BE-2 — Deal becomes a first-class domain object

- **Model says:** Deal originates from exactly one Opportunity and is where the business is paid;
  "Deal" means only the legal construct *(Invariants 4–5; ratified language)*.
- **Today:** no Deal object; control is a value of the overloaded `OpportunityStage`; "Deal" floats
  as a UI/BI synonym for Opportunity.
- **Alignment — align implementation with the Business Domain:**
  introduce the Deal aggregate · re-parent escrow · re-parent financing · re-parent assignments ·
  update workflows · update reports.

## BE-3 — Business Language becomes enforced

- **Model says:** the Language Specification governs every name; No-Synonyms and No-Homonyms hold
  *(Invariant 12)*.
- **Today:** naming is conventional, not enforced; the Conflict Report lists live aliases/homonyms.
- **Alignment:** apply the ratified canonical vocabulary; retire the deprecated words (incl.
  **"Lead"**, "deal contact/target/contact" → Seller, dedupe "match" → Resolution/Merge,
  `Task.ownerId` → assignee, free-text `source` → Acquisition Channel); adopt the API-grade
  change-control process; build the Language Validator (planned).

## BE-4 — Business Events become canonical, and each object owns its lifecycle

- **Model says:** events are immutable and **state is derived from events** *(Invariants 8–9)*; each
  object has its own lifecycle *(ratified)*.
- **Today:** the event-derived `StageSpine` and the mutable 13-value `OpportunityStage` coexist,
  and the enum **conflates four lifecycles** (Seller, Opportunity, Deal, Transaction) into one field.
- **Alignment:** make the **event-derived state the sole authority**; demote `OpportunityStage` to a
  compatibility layer; **decompose the single enum into the Seller, Opportunity, Deal, and
  Transaction lifecycles** (Document 5), each derived from the canonical Event Vocabulary
  (Document 4). *A business smell, not just a software smell — four processes were being thought of
  as one; separating them improves reporting, forecasting, training, onboarding, automation, and AI.*

## BE-5 — Transaction becomes a first-class domain object *(newly authorized)*

- **Model says:** `Deal → creates → Transaction → creates → Revenue`. Transaction is the **execution
  process** — not the Deal, not the money.
- **Purpose:** **separate execution from ownership.**
- **Today:** "transaction" is overloaded three ways (Closing dashboard / `AssignmentRecord` / close
  event) and Revenue is derived separately in BI; there is no Transaction object.
- **Alignment — everything after the Deal belongs to the Transaction:**
  Escrow · Financing · Assignment · Closing · Settlement · Revenue. Introduce the Transaction
  aggregate as the parent of the execution records; Deal creates Transaction; Transaction produces
  Revenue.

---

*These five initiatives are the platform's business-evolution roadmap. They will drive the
engineering, platform, automation, and AI roadmap updates once Documents 4–5 are complete. Tracked
here as business evolution, not as a technical backlog.*
