# BE-3 Candidate Identity Hardening — Increment 4 Acceptance Record

> **Status: ACCEPTED WITH OBSERVATION** (founder-accepted 2026-07-29). Accepts the **isolated,
> read-only, diagnostic, non-authoritative** migration-evidence tooling delivered by Increment 4 (PR
> #28, `20f4c75` → `9412224`). **No tag is created.** No migration has been performed and no baseline
> accepted; `civ-1` remains authoritative, `civ-2` non-authoritative. Governance context:
> `CANDIDATE_IDENTITY_INCREMENT4_REPORT.md`, `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`,
> [[crowdexpanse-be-lifecycle]].
>
> **This tooling proposes mappings. It does not migrate authority.**

## What was accepted

The civ-1 → proposed-civ-2 migration-evidence engine (`lib/governance/be3-candidate-migration.ts` +
CLI + tests 14/14 + implementation report). It consumes civ-2 identity (Increment 1) and lineage
(Increment 3) **read-only** (both, and Increment 2, remained byte-identical); the classifier, detector,
accepted evidence, baselines, and acceptance records are unchanged.

## Proven

- Migration **consumes** identity and lineage rather than determining either; dependency direction
  intact.
- All five classifications represented: `oneToOne · oneToMany · manyToOne · unmapped · ambiguous`.
- **Every old candidate remains visible**; ambiguity **propagates**, never downgraded; unmapped stays
  explicit; one-to-many and many-to-one **require review**.
- Duplicate old records and duplicate proposed identities are **surfaced**.
- **Input ordering does not affect canonical output**; review-queue ordering is deterministic.
- Old candidate records and lineage inputs remain **immutable**; accepted evidence, baselines, and
  acceptance records **unchanged**.
- CLI **requires an explicit output path** and **rejects protected evidence paths without writing**.
- `civ-1` remains authoritative; `civ-2` remains non-authoritative.

## Observation (governed)

> **Migration mappings are deterministic, append-only proposals. A future version should introduce an
> independent `migrationSchemaVersion` before migration evidence becomes part of an authoritative
> baseline.**

Rationale: a `migrationSchemaVersion` — independent of `candidateIdentityVersion`,
`findingIdentityVersion`, and `classificationAlgorithmVersion` — would distinguish (a) the **identities
being mapped**, (b) the **mapping format/semantics**, and (c) the **classification algorithm** used to
interpret the proposal. Recorded as a **non-blocking future refinement**; not implemented here.

## Boundaries this acceptance does NOT authorize

No tag; no migration performed; no baseline accepted; `civ-2` not authoritative. Not authorized:
Increment 5 (corpus rerun + new-baseline acceptance/tag), production integration, and Blocking Mode
planning. `civ-1` remains authoritative.

## Artifacts

| File | Role |
|---|---|
| `lib/governance/be3-candidate-migration.ts` | migration-evidence engine (read-only, non-authoritative) |
| `scripts/diag/be3-candidate-migration.ts` | diagnostic CLI |
| `tests/unit/governance/be3-candidate-migration.test.ts` | 14 focused tests |
| `CANDIDATE_IDENTITY_INCREMENT4_REPORT.md` | implementation report |
| `CANDIDATE_IDENTITY_INCREMENT4_ACCEPTANCE.md` | this acceptance record |

**No tag** by design; migration evidence stays diagnostic and non-authoritative pending the Increment-5
baseline.
