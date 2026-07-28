# BE-3 — Language Conflict Inventory (planning)

> **Status: PLANNING — for review.** A structured, *indicative* inventory of where the codebase
> vocabulary diverges from the canonical Business Architecture language, plus the **method** for the
> exhaustive pass. Frequencies below are from a single bounded read-only scan (`app/ lib/ prisma/`,
> word-boundary matches) and are **evidence to review, not a decision or a change**. No renames.

## Method for the exhaustive inventory (to run during the review phase)

1. **Extract the oracle** — enumerate the canonical terms from Architecture v1.0 (the ubiquitous
   language) into a machine-readable glossary. This is the reference every conflict is measured against.
2. **Three read-only passes** (mirroring BE-2's discipline): (a) schema/persistence vocabulary
   (`prisma/schema.prisma`, enums, `@map`), (b) code identifiers (models, functions, variables,
   types), (c) **surface** language (UI strings, report labels, prompt text, external-facing copy).
3. **Classify every hit**: `aligned` / `synonym-drift` / `overloaded` / `missing` / `wrong-layer`;
   and `this-BE` vs `defer-to-BE-n`; and `internal` vs `surface-visible` (compatibility weight).
4. **No change** is made during inventory — output is this table, fully populated and classified.

## Indicative findings (bounded scan — to be confirmed, not acted on)

Code-frequency snapshot (files containing the term, `*.ts/*.tsx`, `app/ lib/ prisma/`):

| Term | Files | Canonical? | Preliminary tension (hypothesis) |
|---|---:|---|---|
| Property | 37 | ✅ core | Property vs PropertyIdentity boundary is intentional (crosswalk) — verify not conflated in prose |
| Opportunity | 34 | ✅ core | **Overloaded with Deal** — must preserve Opportunity≠Deal (BE-2), not merge |
| Owner | 29 | ✅ core | Owner≠Seller is distinct in code (BE-2 ✅) — confirm surfaces don't say "Seller" for Owner |
| Closing | 27 | ✅ | Closing (process) vs Transaction/Settlement ownership — clarify layer |
| Seller | 26 | ✅ core | Seller vs **Lead** synonym-drift (see below) |
| Buyer | 19 | ✅ core | — |
| Financing | 15 | ✅ | Belongs to Transaction lifecycle (BE-5) — confirm vocabulary home |
| Assignment | 11 | ✅ | Same — Transaction-owned per BE-2 D-2 |
| Transaction | 10 | ✅ | Present but **Settlement absent** (below) |
| Escrow | 9 | ✅ | Transaction-owned (BE-5) |
| Deal | 8 | ✅ (new) | Newly first-class (BE-2); low spread vs Opportunity — enforce the boundary, not parity |
| Lead | 3 | ⚠️ | **Synonym-drift with Seller** — is "Lead" a distinct canonical term or legacy for a pre-qualified Seller? Decision needed |
| Settlement | 0 | ❌ missing | Canonical term has **no code presence** — expected; **defer to BE-5** (Transaction owns settlement/revenue per BE-2 D-2) |

Persistence-vocabulary signals (schema): models include `Owner`, `Seller`, `Buyer`, `Property`,
`PropertyIdentity`, `Opportunity`, `Deal`, `Underwriting*`, `Financing*`; conventions are
snake_case-plural tables via `@@map` with camelCase columns. Enum-like tokens observed:
`INTERESTED_SELLER`, `CONTRACT_EXECUTED`, `DECISION`. **Persisted language (enum values / `@map` /
stored strings) is the highest-compatibility-risk category** and must be handled by the Compatibility
Strategy, not renamed inline.

## Candidate conflict classes (for the review to confirm and populate exhaustively)

1. **Overloaded terms** — one word, two canonical meanings (e.g. Opportunity vs Deal). *Preserve the
   distinction.*
2. **Synonym drift** — two words, one meaning (e.g. Lead vs Seller; possibly Closing vs Settlement in
   prose). *Pick the canonical one, alias the other.*
3. **Missing canonical terms** — architecture term with no code presence (e.g. Settlement). *Usually a
   later-BE concern; record, don't invent.*
4. **Wrong-layer language** — a term used where a different layer's vocabulary belongs (e.g.
   Transaction lifecycle words appearing on Deal surfaces). *Relocate vocabulary, not behavior.*
5. **Surface-visible vs internal** — user-facing strings vs internal identifiers; compatibility and
   change-visibility differ sharply.

## Explicitly out of scope for this document

No term is renamed, aliased, deprecated, or changed here. Settlement/Transaction-family vocabulary is
flagged as **BE-5 territory**. This inventory feeds the Enforcement Plan and Compatibility Strategy.
