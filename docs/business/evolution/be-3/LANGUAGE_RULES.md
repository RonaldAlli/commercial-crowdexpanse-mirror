# BE-3 — Language Rules (planning)

> **Status: PLANNING — for review.** The glossary says *what words exist*; this document says *how they
> may be used*, as **stable, machine-readable rule identifiers**. Like the glossary, it is **NOT a new
> authority** — it projects the ratified usage decisions in `../../3_LANGUAGE_SPECIFICATION.md` (§2
> decisions, §4 verbs, §5 events, §7 Platform Vocabulary) and the **No-Synonyms / No-Homonyms** rules in
> `../../CHANGE_GOVERNANCE.md`. Authority precedence: `3_LANGUAGE_SPECIFICATION.md` → `CANONICAL_GLOSSARY.md`
> (words) → **this file (usage)** → `LANGUAGE_CONFLICT_INVENTORY.md` (deviations). No changes made here.

## Rule identifier convention

Each rule has a **stable ID** of the form `R-<CLASS>-<NNN>`. The **ID is permanent**; the rule *text*
may be refined without breaking references (findings, baselines, dashboards key off the ID). Classes:

| Class | Meaning | Source |
|---|---|---|
| `R-SYN` | No-Synonyms — one canonical word per concept | CHANGE_GOVERNANCE §No-Synonyms |
| `R-HOM` | No-Homonyms — one concept per word | CHANGE_GOVERNANCE §No-Homonyms |
| `R-PLAT` | Platform Vocabulary never stands for a business concept | Doc 3 §7 |
| `R-RET` | Retired word — must not appear on a surface | Doc 3 §2/§3 |
| `R-EVT` | Event words are past-tense/immutable; a state word ≠ an event word | Doc 3 §5 |
| `R-GOV` | Canonical-word changes are Doc-3 changes, not BE-3 decisions | CHANGE_GOVERNANCE |
| `R-BND` | Boundary — report-only; the fix belongs to another BE | this doc |

**Severity:** `error` = an in-scope BE-3 violation (an L-ID, must be closed in Phase 4); `info` =
report-only (boundary / owned by another BE — detected and counted, never actioned by BE-3).

## Global rules

| Rule ID | Rule | Severity |
|---|---|---|
| **R-GOV-001** | Any change to a *canonical* word is a Document-3 change via `CHANGE_GOVERNANCE.md`, never a BE-3 decision | error |
| **R-PLAT-001** | Platform Vocabulary (`Workspace·Dashboard·Pipeline·Queue·Panel·Timeline·Record·View·Report·Copilot`) names representations, never a business concept ("Show the Seller," never "show the record") | error |
| **R-EVT-001** | Events are past-tense and immutable; a **state** word is never an **event** word | info (BE-4-adjacent) |

## Per-word usage rules (BE-3 scope — each maps to a glossary L-ID)

| Rule ID | Word | Allowed use | Forbidden use (→ violation) | L-ID | Severity |
|---|---|---|---|---|---|
| **R-SYN-001** | **Deal** | the legal construct — a controlled Opportunity | as a synonym for **Opportunity** | (BE-2, enforced) | error |
| **R-HOM-001** | **Pipeline / Opportunity** | `Pipeline` = a §7 view; `Opportunity` = the object | "Pipeline" naming the Opportunity **object** | **L1** | error |
| **R-SYN-002** | **Seller** | the acquisition relationship (*represents* Owner) | "deal contact" / "target" / "contact" for that party | **L2** | error |
| **R-SYN-003** | **Acquisition Channel** | the structured origin of a Seller/Opportunity | free-text `Opportunity.source` | **L3** | error |
| **R-SYN-004** | **Transaction Closed** | the close event | BI "closed-won" (CRM-ism) | **L4** | error |
| **R-HOM-002** | **Match** | **Buyer ↔ Deal only** | "match" for identity de-duplication (→ **Resolution / Merge**) | **L5** | error |
| **R-HOM-003** | **assignee / Owner** | `assignee` = task target; `Owner` = title-holder | "owner" for the Task assignee (`Task.ownerId`) | **L6** | error |
| **R-RET-001** | **Lead** *(retired)* | *(none — `Owner → Seller → Opportunity → Deal`)* | "Lead" as a stage/prospect word on any surface | **L0** | error (surface); code = BE-4 |

## Boundary rules (report-only — detector counts them, BE-3 does **not** action them)

| Rule ID | Boundary | Owner | Severity |
|---|---|---|---|
| **R-BND-001** | mutable `OpportunityStage` as the *state authority* | BE-4 | info |
| **R-BND-002** | first-class **Transaction** object (vs Closing dashboard / `AssignmentRecord` / money) | BE-5 | info |
| **R-BND-003** | preserve the ratified distinctions **Owner≠Seller**, **Opportunity≠Deal**, **Deal≠Transaction** (a rule that would collapse them is itself a violation) | invariant | error |

## How rules are used downstream

The **Conflict Inventory** records *where* each rule is violated (evidence, keyed by Rule ID + L-ID).
The **Enforcement Plan** detector evaluates each rule predicate and emits findings that reference the
Rule ID (see its finding schema). The **Compatibility Strategy** maps each violation's fix to a tier.
No rule is *acted on* until the Compatibility Strategy is approved.
