# BE-3 — Language Enforcement Plan (planning)

> **Status: PLANNING — for review.** Proposes *how* the ratified canonical language is enforced.
> **Observability first; detect-and-measure before any change.** No renames, schema, API, UI, report,
> prompt, or migration changes are proposed or made now. Oracle = `CANONICAL_GLOSSARY.md` →
> `../../3_LANGUAGE_SPECIFICATION.md`. Scope = the six mappings L1–L6 + Lead-surface (L0).

## Principle — BE-3 is an observability project first

```
Phase 1  DETECT    — find every deviation (L1–L6/L0) in the live tree      (read-only)
Phase 2  MEASURE   — score alignment (65% → target); publish the metric     (read-only)
Phase 3  PREVENT   — fail CI on NEW deviations only (baseline the existing)  (non-destructive)
Phase 4  REDUCE    — close existing deviations, per Compatibility Strategy    (destructive — gated)
```

Everything through Phase 3 is non-destructive. **Phase 4 does not begin until
`COMPATIBILITY_STRATEGY.md` is approved.** Existing divergence is *reduced last*, deliberately.

## The oracle (already exists — not rebuilt)

The canonical words are frozen in Doc 3 §2; `CANONICAL_GLOSSARY.md` is their BE-3-scoped projection
with the deprecated→canonical pairs and evidence. Enforcement validates representations *against* this
frozen set. Nothing is enforced that the glossary/Doc 3 does not define (no enforcing an unratified
opinion). Changing a canonical word is a **Doc-3 change** via `../../CHANGE_GOVERNANCE.md`, not BE-3.

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
