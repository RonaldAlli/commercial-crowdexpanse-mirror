# BE-3 — Detector Specification (planning)

> **Status: PLANNING — for review.** Specifies the Phase-1 detector as a **product** (contract), kept
> separate from its future implementation — the same separation as glossary (words) vs rules (usage).
> The detector is **read-only** and its sole objective is to answer *"exactly where does every L0–L6
> deviation exist?"*. Building it is authorized only after this branch merges. Inputs/authority:
> `CANONICAL_GLOSSARY.md`, `LANGUAGE_RULES.md`; output contract: the finding schema in `ENFORCEMENT_PLAN.md`.

## Identity

`BE3-DET` — the BE-3 language detector. Implementation tasks are `BE3-DET-001…` (see work breakdown).

## Inputs

| Input | Source | Role |
|---|---|---|
| Canonical glossary | `CANONICAL_GLOSSARY.md` (→ Doc 3 §2) | the canonical words (L-IDs) |
| Language rules | `LANGUAGE_RULES.md` | the `R-*` predicates + severity to evaluate |
| Source tree | the repo working tree at a pinned commit | what is scanned |
| Allow-list | committed config | legitimate exceptions that must **not** be flagged (below) |
| Scope config | committed config | included file types + ignored paths (below) |

**Allow-list (false-positive guards, from Doc 3):** `Pipeline` as a §7 **view** (R-PLAT); `BuyerMatch`
and Buyer↔Deal "Match" (canonical, R-HOM-002); compound field names that are already qualified
(`targetCloseDate`, `TARGET_LTV_PCT`, `targetAssetTypes` — not the bare "target"=Seller synonym);
provenance/source-category namespaces (distinct from `Opportunity.source`).

## Outputs

| Output | Form | Notes |
|---|---|---|
| Findings | array of the `ENFORCEMENT_PLAN.md` finding records | `findingId?·ruleId·glossaryTerm·lId·file/line·severity·matched·confidence` |
| Alignment score | number + breakdown | derived from `error` findings; baseline expected ~65% |
| Rule summary | count per `R-*` | how many violations of each rule |
| L-ID summary | count per `L0–L6` | remediation-item sizing for Phase 4 |
| Machine-readable report | JSON (canonical) | the authoritative artifact; dashboards/CI consume this |
| Human report | Markdown/text | rendered from the JSON — never a separate source of truth |

Scoring is specified in the Enforcement Plan (Phase 2); Phase 1 emits the **inputs** to it (the error
counts), not a tuned score. Every finding carries `confidence: 1.0` in Phase 1.

## Determinism (hard requirement)

```
same source commit + same glossary + same rules + same allow-list
        ↓            ↓             ↓              ↓
                     same findings
                          ↓
                     same score
                          ↓
                     same report (byte-identical JSON)
```

- No clock, randomness, network, or environment reads influence output.
- Findings sorted by a total order: `file` → `line` → `ruleId` → `matched`.
- The rule set is **versioned**; the report records the glossary/rules commit it ran against.
- Re-running on an unchanged tree reproduces the artifact exactly (enables the Phase-3 baseline diff).

## Performance & scope

- **Target:** full-tree scan well under the CI step budget (target ≤ ~30s); it is a lint-class pass.
- **Included file types:** `*.ts`, `*.tsx` (code + surface strings), `*.prisma` (schema/enum/`@map`),
  and BI query modules. Surface language (UI labels, report headers, prompt text) is scanned in-place.
- **Ignored paths:** `node_modules/`, `.next*/`, build/dist/coverage outputs, and **`docs/`** — the
  governance documents (glossary, spec, this inventory) legitimately *quote* deprecated words and must
  never be flagged. The spec/reports are the oracle, not a violation surface.

## Boundary (Phase 1 only — READ-ONLY)

The detector **reads and reports**. It performs **no** renames, aliases, schema/persistence changes,
migrations, API/UI/prompt changes, or writes to the source tree. It exits once it can answer the single
question above; that JSON artifact is BE-3's first evidence package, reviewed before Phase 2 (Measure).

## Work breakdown (spec-level — not code)

| Task | Deliverable |
|---|---|
| **BE3-DET-001** | Load glossary + rules + allow-list into an in-memory rule set (versioned) |
| **BE3-DET-002** | Scanners per input type (code identifiers, schema/enum/`@map`, surface strings, BI labels) |
| **BE3-DET-003** | Rule evaluation → findings in the canonical schema (with `confidence: 1.0`) |
| **BE3-DET-004** | Deterministic ordering + JSON emitter + human render |
| **BE3-DET-005** | Rule-summary + L-ID-summary + alignment-score **input** aggregation |
| **BE3-DET-006** | Self-test on known fixtures (each `R-*` has a positive + an allow-listed negative case) |

## Success criterion

`BE3-DET` produces a deterministic JSON evidence package enumerating every L0–L6 deviation with its
`ruleId`, `lId`, `file:line`, and `severity` — and stops. Nothing is changed.
