# BE-3 — Language Readiness Review (planning)

> **Status: PLANNING — for review. No code, renames, schema, API, UI, report, prompt, or migration
> changes are proposed or made by this document or this branch.** Deliverable 1 of 5 in the BE-3
> planning set; nothing here is a decision until reviewed and approved. All vocabulary is governed by
> `CANONICAL_GLOSSARY.md`, which projects the ratified `../../3_LANGUAGE_SPECIFICATION.md`.

BE-3's objective (per `../INDEX.md`): raise **Language alignment from ~65% toward the frozen Business
Architecture v1.0 vocabulary** by *enforcing* the ratified canonical language — **without** replacing
the architecture and **without** destructive renames ahead of an approved compatibility strategy.

## Verdict

**READY TO PLAN — NOT READY TO IMPLEMENT.** The canonical vocabulary already exists and is frozen, and
BE-3's scope is already delimited by the spec; what remains before implementation is the
Enforcement-mechanism choice and the Compatibility-Strategy sign-off.

## Decisive readiness finding

Unlike a greenfield language initiative, **the oracle already exists**: `3_LANGUAGE_SPECIFICATION.md`
(§1–§7 RATIFIED 2026-07-27; §2 canonical vocabulary **frozen**), validated by
`LANGUAGE_CONFLICT_REPORT.md`. Document 3 §3 even assigns each deprecated term a "Retire via BE-n" —
so **BE-3's scope is not open-ended; it is exactly six mappings** (L1–L6) plus the surface-language
half of *Lead* (L0). BE-3 does **not** re-decide vocabulary; it enforces already-ratified decisions.
`CANONICAL_GLOSSARY.md` is the BE-3-scoped projection of that authority.

## BE-3 is an observability project first (philosophy)

Enforcement is sequenced to **minimise risk**, deferring all destructive change:

```
Detect  →  Measure  →  Prevent (new drift)  →  … much later …  Reduce (existing drift)
```

Only the **Reduce** phase changes existing code/schema/surfaces, and only per the Compatibility
Strategy after explicit approval. See `ENFORCEMENT_PLAN.md`.

## BE-3 scope (from `CANONICAL_GLOSSARY.md`, bounded)

In scope — the six ratified retirements: **L1** "Pipeline"(object)→Opportunity · **L2** "deal
contact/target/contact"→Seller · **L3** `Opportunity.source` free-text→Acquisition Channel · **L4**
"closed-won"→Transaction Closed · **L5** "match"(dedupe)→Resolution/Merge · **L6** `Task.ownerId`
"owner"→assignee · plus **L0** *Lead* surface-language retirement (code enum deferred to BE-4).

Out of scope (bounded away): Deal-as-concept (**BE-2**, done); `OpportunityStage`-as-authority and
*Lead* **code** (**BE-4**); first-class **Transaction** object (**BE-5**).

## Preconditions

| # | Condition | State |
|---|---|---|
| 1 | Business Architecture v1.0 frozen on `main` (canonical source) | ✅ ratified M1 (`8b73426`) |
| 2 | Canonical glossary exists to enforce *against* | ✅ **satisfied** — Doc 3 §2 frozen; projected in `CANONICAL_GLOSSARY.md` |
| 3 | BE-3 scope delimited (which terms, which BE) | ✅ Doc 3 §3 "Retire via BE-3" → six mappings |
| 4 | Governance tooling available (verify-merge / guarded-migrate / post-deploy monitor) | ✅ complete on `main` (`7c1ad35`) |
| 5 | Compatibility strategy approved before any rename | ⛔ **GATE** — `COMPATIBILITY_STRATEGY.md`; nothing renames until signed off |

## Recommended conditions for proceeding to implementation (draft, for approval)

1. Enforcement mechanism chosen and shown **non-destructive** in its first phase (detect + measure only).
2. Each of L1–L6/L0 classified by compatibility tier **before** any change is written.
3. Compatibility Strategy approved, with a standing **no-destructive-rename-before-approval** rule.
4. Any proposed change to a *canonical* word routed through `../../CHANGE_GOVERNANCE.md`, not BE-3.
