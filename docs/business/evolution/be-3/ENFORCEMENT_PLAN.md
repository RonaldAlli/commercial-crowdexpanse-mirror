# BE-3 — Language Enforcement Plan (planning)

> **Status: PLANNING — for review.** Proposes *how* canonical language will be enforced. **Detect-only
> first; no renames, schema, API, UI, report, prompt, or migration changes are proposed or made now.**
> Every phase past detection is gated on approval and on the Compatibility Strategy.

## Principle

Enforcement is **evidence-first and additive before subtractive**: first make divergence *visible and
measurable* against a frozen glossary; only then, and only with an approved compatibility path, change
anything. This mirrors the BE-2 discipline (decide → freeze → model → acceptance → implement → verify)
and reuses the governance tooling now on `main`.

## The oracle

A single **canonical glossary** extracted from Business Architecture v1.0 is the source of truth:
`term → {canonical form, definition, layer, allowed synonyms/aliases, surface-visible?}`. It is
**frozen** before enforcement begins. Nothing is enforced that the glossary does not define
(prevents enforcing an unratified opinion).

## Phased approach (each phase is its own gated change; only Phase 0 is in scope to *plan* now)

| Phase | What | Destructive? | Gate |
|---|---|---|---|
| **0. Glossary** | Extract + freeze the canonical glossary from Architecture v1.0 | No | Review sign-off |
| **1. Detect** | A **read-only linter/report** that scores language alignment and lists divergences (feeds a "Language %" metric) | No | Runs in CI as **advisory**, non-blocking |
| **2. Guard new code** | Fail CI on **newly introduced** non-canonical terms (allow-list the existing backlog) | No (prevents *new* drift only) | Approval; must not retro-break existing code |
| **3. Align internal** | Rename *internal* identifiers to canonical, behavior-preserving | Yes (internal) | **Compatibility Strategy** approved |
| **4. Align persistence** | Enum/`@map`/stored-string alignment | Yes (high-risk) | Compatibility Strategy + **guarded migration** (`migrate-deploy-guarded.sh`) |
| **5. Align surfaces** | UI/report/prompt/external copy | Yes (user-visible) | Product sign-off (user-facing change) |

**Only Phases 0–1 are non-destructive.** Phases 3–5 do not begin until the Compatibility Strategy is
approved. Persistence and surface phases are the most sensitive and are sequenced last.

## Proposed mechanism (for review — not built here)

- A **glossary file** (canonical terms + aliases) checked into the repo.
- A **detector** script (read-only) that scans code/schema/surfaces and emits an alignment report +
  score. It classifies each hit exactly as the inventory does. **Advisory in CI first** — deliberately
  *not* a hard gate, so it does not become another permanently-red check (see the CI-hygiene lesson;
  cf. `../../../roadmap/OPS_BACKLOG.md` OPS-3).
- Only after detection is trusted does the guard (Phase 2) escalate a *subset* to blocking, scoped to
  **new** code via an allow-listed baseline of known existing divergences.

## Reuse of governance tooling (inherited, not rebuilt)

- **`verify-merge.sh`** — verify each enforcement PR truly lands on `main`.
- **`migrate-deploy-guarded.sh`** — any persistence-language migration (Phase 4) goes through the
  guarded, fail-closed path (expected DB, allow-list, backup evidence, prod confirm).
- **`post-deploy-monitor.sh`** — watch health/restarts/errors after any surface/persistence change.

## Success criteria (draft)

- Language alignment metric defined and **rising** (65% → target set at review).
- **Zero new** non-canonical terms merged after Phase 2.
- No behavior change attributable to language alignment (pure refactors verified green).
- Every destructive step traceable to an approved glossary entry + compatibility record.

## Non-goals

No collapsing of intentionally-distinct terms (Opportunity≠Deal, Owner≠Seller, Deal≠Transaction). No
invention of missing terms (e.g. Settlement) — those are later-BE work. No blocking CI before detection
is trusted.
