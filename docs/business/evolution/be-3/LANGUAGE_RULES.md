# BE-3 — Language Rules (planning)

> **Status: PLANNING — for review.** The glossary says *what words exist*; this document says *how they
> may be used*. Like the glossary, it is **NOT a new authority** — it is a machine-actionable projection
> of the ratified usage decisions in `../../3_LANGUAGE_SPECIFICATION.md` (§2 ratified decisions, §4
> verbs, §5 events, §7 Platform Vocabulary) and the **No-Synonyms / No-Homonyms** rules in
> `../../CHANGE_GOVERNANCE.md`. Authority precedence: `3_LANGUAGE_SPECIFICATION.md` → `CANONICAL_GLOSSARY.md`
> (words) → **this file (usage)** → `LANGUAGE_CONFLICT_INVENTORY.md` (deviations). No changes made here.

## Why a separate rules file

A definition ("Deal = a controlled Opportunity") is not a usage constraint ("Deal is *never* a synonym
for Opportunity"). The detector (Enforcement Plan Phase 1) keys off **rules**, not prose: each rule is a
predicate a scanner can evaluate. Rules are stated so that a violation maps to a glossary **L-ID**.

## Global rules (from `CHANGE_GOVERNANCE.md`)

- **R-SYN (No-Synonyms):** exactly one canonical word per concept. A second word for the same concept is
  a violation → deprecate to the canonical.
- **R-HOM (No-Homonyms):** exactly one concept per word. A word carrying a second meaning is a violation
  → the off-meaning renames.
- **R-PLAT (§7):** Platform Vocabulary (`Workspace·Dashboard·Pipeline·Queue·Panel·Timeline·Record·View·
  Report·Copilot`) names *representations*, never business concepts. "Show the Seller," never "show the record."
- **R-EVT (§5):** events are past-tense and immutable; a **state** word is never an **event** word.
- **R-GOV:** any change to a *canonical* word is a Document-3 change via `CHANGE_GOVERNANCE.md`, not a BE-3 decision.

## Per-word usage rules (BE-3 scope — each maps to a glossary L-ID)

| Rule | Word | Allowed use | Forbidden use (→ violation) | L-ID | Kind |
|---|---|---|---|---|---|
| **U-DEAL** | **Deal** | the legal construct — a controlled Opportunity | as a synonym for **Opportunity** | (BE-2, enforced) | R-SYN |
| **U-OPP** | **Opportunity** | the not-yet-controlled acquisition (the object) | naming the object **"Pipeline"** | **L1** | R-HOM |
| **U-PIPE** | **Pipeline** | *only* a §7 view of Opportunities | as the Opportunity **object / entity** | **L1** | R-PLAT |
| **U-SELLER** | **Seller** | the acquisition relationship (*represents* Owner) | "deal contact" / "target" / "contact" for that party | **L2** | R-SYN |
| **U-CHAN** | **Acquisition Channel** | the structured origin of a Seller/Opportunity | free-text `Opportunity.source` | **L3** | R-SYN |
| **U-TXN-CLOSED** | **Transaction Closed** | the close event | BI "closed-won" (CRM-ism) | **L4** | R-SYN |
| **U-MATCH** | **Match** | **Buyer ↔ Deal only** | "match" for identity de-duplication (→ **Resolution / Merge**) | **L5** | R-HOM |
| **U-ASSIGNEE** | **assignee** | the party a Task is assigned to | "owner" for the Task assignee (`Task.ownerId`) | **L6** | R-HOM |
| **U-OWNER** | **Owner** | the legal title-holder only | "owner" meaning a Task assignee | **L6** | R-HOM |
| **U-LEAD** | *(none)* | progression is `Owner → Seller → Opportunity → Deal` | "Lead" as a stage/prospect word on any surface | **L0** | retirement |

## Boundary rules (kept out of BE-3, stated so the detector does not over-reach)

- **U-STAGE:** "stage" is a **view** over event-derived state (§7); the mutable `OpportunityStage` as the
  *authority* is a **BE-4** concern — BE-3's detector may *report* it but must not flag it for change.
- **U-TXN-OBJ:** a first-class **Transaction** object (vs Closing dashboard / `AssignmentRecord` / money)
  is **BE-5** — out of BE-3.
- **U-DISTINCT:** the ratified distinctions **Owner≠Seller**, **Opportunity≠Deal**, **Deal≠Transaction**
  must be *preserved*; a rule that would collapse them is itself a violation of these rules.

## How rules are used downstream

The **Conflict Inventory** records *where* each rule is violated (evidence). The **Enforcement Plan**
detector evaluates these predicates to produce the alignment score. The **Compatibility Strategy** maps
each violation's fix to a tier. No rule is *acted on* until the Compatibility Strategy is approved.
