# BE-3 — Language Readiness Review (planning)

> **Status: PLANNING — for review. No code, renames, schema, API, UI, report, prompt, or migration
> changes are proposed or made by this document or this branch.** This is deliverable 1 of 4 in the
> BE-3 planning set; nothing here is a decision until reviewed and approved.

BE-3's objective (per `../INDEX.md`): move the platform's **language alignment from ~65% toward the
frozen Business Architecture v1.0 vocabulary**, by *enforcing* the canonical ubiquitous language in
code, schema, and surfaces — **without** replacing the architecture and **without** destructive
renames ahead of an approved compatibility strategy.

## Verdict

**READY TO PLAN — NOT READY TO IMPLEMENT.** The prerequisites to *scope and inventory* the language
work are met; the prerequisites to *change* anything are deliberately deferred to the Enforcement
Plan + Compatibility Strategy sign-off.

## Why now (sequence)

BE-2 (Deal first-class) is deployed & accepted (M3, 2026-07-28), and the **Governance Operational
Tooling** initiative that followed it is complete on authoritative `main` (`7c1ad35`). Per the
permanent lifecycle, tooling improvements land *before* the next BE, so BE-3 inherits — rather than
re-invents — the merge/migration/monitor controls. See `../../../roadmap/OPS_BACKLOG.md` and the
governance runbook.

## Preconditions

| # | Condition | State |
|---|---|---|
| 1 | Business Architecture v1.0 frozen and on `main` (the canonical vocabulary source) | ✅ ratified M1 (`8b73426`) |
| 2 | BE-2 vocabulary decisions recorded (Deal, Opportunity≠Deal, Deal≠Transaction) | ✅ `../be-2/DECISIONS.md`, `../be-2/READINESS_REVIEW.md` |
| 3 | Governance tooling available (verify-merge / guarded-migrate / post-deploy monitor) | ✅ complete on `main` |
| 4 | A canonical **glossary** exists to enforce *against* | ⚠️ **CONDITION** — must be confirmed/extracted from Architecture v1.0 before any enforcement; see Enforcement Plan |
| 5 | Compatibility strategy approved before any rename | ⛔ **GATE** — deliverable 4; nothing renames until this is signed off |

## Scope boundary (what BE-3 is / is not)

- **Is:** establishing the canonical glossary, inventorying where code/schema/surfaces diverge from
  it, and defining *how* alignment will be enforced and *how* compatibility is preserved.
- **Is not:** renaming models/fields/routes, changing schema or migrations, altering APIs/UI/reports/
  prompts, or introducing new business objects. Those are downstream, post-approval, and mostly land
  in later BEs (e.g. **Settlement**/**Transaction** vocabulary → BE-5).

## Known risks to weigh at review

- **Opportunity vs Deal overload** — both terms are load-bearing and now co-exist (BE-2). Enforcement
  must preserve the *distinction*, not collapse it.
- **Surface-visible language** — some terms appear in UI/reports/prompts and external-facing strings;
  renaming those is a user-facing change, not a pure refactor.
- **Persisted language** — enum values, `@map` names, and stored strings are the hardest to change
  and most compatibility-sensitive.

## Recommended conditions for proceeding to implementation (draft, for approval)

1. Canonical glossary extracted from Architecture v1.0 and **frozen** as the enforcement oracle.
2. Conflict inventory reviewed and each entry **classified** (evidence vs hypothesis; this-BE vs later-BE).
3. Enforcement mechanism chosen and shown to be **non-destructive** in its first phase (detect-only).
4. Compatibility strategy approved, with an explicit **no-destructive-rename-before-approval** rule.
