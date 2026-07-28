# BE-3 — Language Enforcement Plan (planning)

> **Status: PLANNING — for review.** Proposes *how* the ratified canonical language is enforced.
> **Observability first; detect-and-measure before any change.** No renames, schema, API, UI, report,
> prompt, or migration changes are proposed or made now. Oracle = `CANONICAL_GLOSSARY.md` →
> `../../3_LANGUAGE_SPECIFICATION.md`. Scope = the six mappings L1–L6 + Lead-surface (L0).

## Principle — BE-3 is an observability project first (ordering FROZEN)

```
Phase 1  DETECT    — find every deviation (L1–L6/L0) in the live tree      (read-only)
Phase 2  MEASURE   — score alignment (65% → target); publish the metric     (read-only)
Phase 3  PREVENT   — fail CI on NEW deviations only (baseline the existing)  (non-destructive)
Phase 4  REDUCE    — close existing deviations, per Compatibility Strategy    (destructive — gated)
```

**This ordering is frozen for BE-3.** Detect + Measure gather information; Prevent stops *new* drift;
Reduce cleans up *old* drift and is deliberately **last**. Everything through Phase 3 is non-destructive.
**Phase 4 does not begin until `COMPATIBILITY_STRATEGY.md` is approved.** Each phase is separately
authorized: entering a phase requires the prior phase's output to be reviewed.

## The oracle (already exists — not rebuilt)

Two frozen inputs, both projections of Doc 3 (not re-decided here):
- **Words** — `CANONICAL_GLOSSARY.md` → Doc 3 §2 (canonical nouns + the BE-3 deprecated→canonical pairs).
- **Usage** — `LANGUAGE_RULES.md` → Doc 3 §2 decisions/§4/§5/§7 + No-Synonyms/No-Homonyms. Each rule
  (U-…/R-…) is a **predicate the detector evaluates**; a violation maps to an L-ID.

Nothing is enforced that the glossary/rules/Doc 3 do not define (no enforcing an unratified opinion).
Changing a canonical word is a **Doc-3 change** via `../../CHANGE_GOVERNANCE.md`, not BE-3.

## Phase 1 (Detect) — the only phase authorized to build after this branch merges

Build **only**: the detector (evaluates the `LANGUAGE_RULES.md` predicates over code/schema/surfaces),
its scoring input, and its report. **No** renames, aliases, schema, persistence, UI, reports, prompts,
or migrations. **Exit criterion (single):** the detector can answer, with evidence, *"exactly where does
every L0–L6 deviation exist?"* — nothing more. The detector output is then reviewed as BE-3's first
evidence package **before** Measure (Phase 2) begins.

## Phases (each a separately gated change; only Phases 1–2 are non-destructive and plannable now)

| Phase | What | Destructive? | Gate |
|---|---|---|---|
| **1 · Detect** | Read-only linter: scan code/schema/surfaces for L1–L6/L0, attach each hit to its L-ID, emit a report | No | Review sign-off of the detector rules |
| **2 · Measure** | Turn the report into a **Language-alignment score** (baseline 65%; per-term breakdown); publish it as **advisory CI** | No | Advisory only — must **not** become a blocking, permanently-red check (cf. OPS-3 CI-hygiene lesson) |
| **3 · Prevent** | Escalate a subset to **blocking on NEW code only**, via an allow-listed baseline of existing hits | No (blocks *new* drift; existing untouched) | Approval; zero retro-breakage |
| **4 · Reduce** | Close L1–L6/L0, one L-ID at a time, ascending blast radius | Yes | **Compatibility Strategy approved**, per-item tier + reversible path |

## Mechanism (for review — not built here)

- A **glossary rules file** derived from `CANONICAL_GLOSSARY.md` (canonical words + deprecated
  patterns + the §7 Platform-Vocabulary allow-list so "Pipeline"-as-view is not flagged).
- A **read-only detector** that classifies each hit exactly as the inventory does (L-ID + class) and
  scores alignment. **Advisory in CI first** — trustworthy signal before any gate.
- Only after the detector is trusted does Phase 3 make a scoped subset blocking, baselined to today's
  known hits so only *new* deviations fail.

## Reuse of governance tooling (inherited)

- **`verify-merge.sh`** — verify each enforcement PR truly lands on `main` (authoritative gate =
  Gitea/origin; mirror = observability only, per OPS-4).
- **`migrate-deploy-guarded.sh`** — any Phase-4 persistence change (L3 `source`, L6 `Task.ownerId`)
  goes through the guarded, fail-closed migration path.
- **`post-deploy-monitor.sh`** — watch health/restarts/errors after any surface/persistence change.

## Success criteria (draft)

- Alignment metric defined and **rising** from 65% (target set at review).
- **Zero new** deprecated-term usages merged after Phase 3.
- No behavior change attributable to language alignment (pure refactors verified green).
- Every Phase-4 change traceable to an L-ID + an approved compatibility path.

## Non-goals

No collapsing intentionally-distinct terms (Opportunity≠Deal, Owner≠Seller, Deal≠Transaction, "Match"
= Buyer↔Deal only). No touching BE-4/BE-5 vocabulary. No blocking CI before the detector is trusted.
