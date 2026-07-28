# BE-3 — Canonical Glossary (planning)

> **Status: PLANNING — for review.** This is the single vocabulary reference for BE-3, but it is
> **NOT a new authority.** It is a *scoped projection* of the ratified **Business Language
> Specification** (`../../3_LANGUAGE_SPECIFICATION.md`, §1–§7 RATIFIED 2026-07-27, canonical §2
> **frozen**) and the **Language Conflict Report** (`../../LANGUAGE_CONFLICT_REPORT.md`). Creating an
> independent glossary would itself violate the **No-Synonyms Rule** — so this document only *points
> to* and *narrows* the frozen vocabulary to BE-3's scope. Authority precedence:
> `3_LANGUAGE_SPECIFICATION.md` → this glossary → the other BE-3 docs.

## Authority chain

```
Reality → Business → Language → Code
                         │
   3_LANGUAGE_SPECIFICATION.md  (RATIFIED; §2 frozen; governed by CHANGE_GOVERNANCE.md)
                         │  (BE-3-scoped projection)
             be-3/CANONICAL_GLOSSARY.md   ← this file   (WHAT words exist)
                         │
             be-3/LANGUAGE_RULES.md                      (HOW words may be used)
                         │
   READINESS_REVIEW · LANGUAGE_CONFLICT_INVENTORY · ENFORCEMENT_PLAN · COMPATIBILITY_STRATEGY
```

This glossary defines the **words**; `LANGUAGE_RULES.md` defines their **allowed usage** (e.g. "Deal is
never a synonym for Opportunity"; "Pipeline is only a view"; "Match is Buyer↔Deal only"). The detector
keys off the rules; the inventory records where they are violated.

The nine canonical concepts (Doc 3 §1) — **not redefined here, cited as-is**:
`Market · Property · Owner · Seller · Buyer · Opportunity · Deal · Transaction · Revenue`.
Canonical nouns are frozen (§2). Governance rules that bind BE-3: **No-Synonyms** (one word per
concept), **No-Homonyms** (one concept per word), and **§7 Platform Vocabulary** (`Pipeline`,
`Dashboard`, `Record`… name *representations*, never business concepts).

## BE-3 operative scope — the vocabulary BE-3 is chartered to enforce

Doc 3 §3 assigns each deprecated term a "Retire via BE-n." **BE-3 owns exactly these six** (plus the
surface-language half of *Lead*). Each row is the authoritative canonical↔deprecated pair; evidence
`file:line` is from the Conflict Report / Spec §3.

| ID | Canonical (frozen §2) | Deprecated usage to retire | Where (evidence) | Kind | Layer |
|---|---|---|---|---|---|
| **L1** | **Opportunity** (object); `Pipeline` allowed *only* as a §7 view | "Pipeline" used as the Opportunity **object** (nav) | `app/.../workspace-shell.tsx:24` | homonym split | surface |
| **L2** | **Seller** (relationship; *represents* Owner) | "deal contact" / "target" / "contact" for the acquisition party | `prisma/schema.prisma:899`; `acquire/page.tsx:130` | synonym | schema + surface |
| **L3** | **Acquisition Channel** (structured origin) | `Opportunity.source` free-text | `prisma/schema.prisma:1164` | synonym | data/schema |
| **L4** | **Transaction Closed** (event) | BI "closed-won" (CRM-ism) | `lib/.../queries.ts:70` | synonym | BI/report label |
| **L5** | **Resolution / Merge** (identity dedupe) | "match" used for dedupe | `OwnerMatchDecision`, `PropertyMatchDecision` | homonym split | code identifiers |
| **L6** | **assignee** (task) | `owner` used for the Task assignee | `prisma/schema.prisma:1741` (`Task.ownerId`) | homonym split | schema/code |
| **L0** | (no platform word — `Owner → Seller` progression) | "Lead" as a stage/prospect word | `acquire/page.tsx:174`; import flows | retirement | **surface/language only** (code enum = BE-4) |

> **"Match" stays canonical for Buyer ↔ Deal only** (Doc 3 §2). L5 retires "match" *only* where it
> means identity de-duplication.

## Explicitly OUT of BE-3 scope (bounds the initiative)

| Term / decision | Owner | Why not BE-3 |
|---|---|---|
| "Deal" (= Opportunity) → Deal as its own concept | **BE-2** (done) | Deal aggregate already first-class |
| `OpportunityStage` (13 mutable) as the state authority | **BE-4** | event-derived state is the canonical model; a lifecycle change, not a rename |
| "Lead" **code** (`OpportunityStage.LEAD`, import code) | **BE-4** | lands with the stage/lifecycle work |
| "transaction" (= Closing dashboard / `AssignmentRecord` / the money) → first-class **Transaction** | **BE-5** | needs a new object, not a rename |

## Rule of use

Every other BE-3 document refers to a business thing by its **frozen §2 word** and cites this
glossary's ID (L1–L6/L0) rather than re-defining terms. Any proposed change to a canonical word is a
**Document-3 change** governed by `../../CHANGE_GOVERNANCE.md` — not a BE-3 decision.
