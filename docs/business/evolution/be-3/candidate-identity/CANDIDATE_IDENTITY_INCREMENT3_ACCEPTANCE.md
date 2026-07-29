# BE-3 Candidate Identity Hardening — Increment 3 Acceptance Record

> **Status: ACCEPTED** (founder-accepted 2026-07-29). Accepts the **isolated, diagnostic,
> non-authoritative** repository-lineage layer delivered by Increment 3 (PR #26, `1eb3e4d` → `a452093`).
> **No tag is created.** `civ-2` remains **non-authoritative**; `civ-1` remains authoritative. Governance
> context: `CANDIDATE_IDENTITY_INCREMENT3_REPORT.md`, `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`,
> [[crowdexpanse-be-lifecycle]].

## What was accepted

The lineage layer (`lib/governance/be3-candidate-lineage.ts` + CLI + tests 12/12 + implementation
report). It reuses `civ-2` (Increment 1) and the compatibility contract (Increment 2) **read-only**
(both remained byte-identical); the candidate classifier, detector, accepted evidence, and baselines are
unchanged.

## Proven

- Lineage is modeled **independently** from compatibility and classification.
- **Rename continuity requires evidence**, not filename heuristics; competing predecessors → `ambiguous`;
  move without sufficient evidence does **not** fabricate continuity.
- Baseline history is **append-only**; split and merge are modeled explicitly.
- **Reintroduction** occurs only with **deterministic lineage**; reappearance without evidence is not
  silently the same candidate — **no silent false negatives**.
- **Deterministic** execution preserved; Increment 1/2 files **byte-identical**; **production behavior
  unchanged**.

## Architectural observation (non-blocking)

> **Migration will consume lineage, but lineage must remain independent of migration logic so that
> repository history remains the authoritative source of continuity.**

Concretely, the intended dependency direction is `Candidate Identity → Lineage → Classification`, with
**migration (Increment 4) consuming lineage — never the reverse.** Recorded as a **future
architectural note**; not implemented here.

## Boundaries this acceptance does NOT authorize

No tag; `civ-2` not authoritative; lineage is **not wired** into the live classifier or production. Not
authorized: Increment 4 (migration tooling), Increment 5 (corpus rerun + new-baseline acceptance/tag),
and Blocking Mode planning. `civ-1` remains authoritative.

## Artifacts

| File | Role |
|---|---|
| `lib/governance/be3-candidate-lineage.ts` | lineage layer (diagnostic, non-authoritative) |
| `scripts/diag/be3-candidate-lineage.ts` | diagnostic CLI |
| `tests/unit/governance/be3-candidate-lineage.test.ts` | 12 focused tests |
| `CANDIDATE_IDENTITY_INCREMENT3_REPORT.md` | implementation report |
| `CANDIDATE_IDENTITY_INCREMENT3_ACCEPTANCE.md` | this acceptance record |

**No tag** by design; lineage stays diagnostic and non-authoritative pending the Increment-5 baseline.
