# BE-3 Candidate Identity — Increment 4 Implementation Report

> **Status: for review (Candidate Identity Increment 4 Review). ISOLATED, READ-ONLY, DIAGNOSTIC,
> NON-AUTHORITATIVE.** Adds civ-1 → proposed-civ-2 **migration EVIDENCE** tooling
> (`lib/governance/be3-candidate-migration.ts`, CLI, tests, this report). It **proposes mappings**; it
> performs no migration and switches no authority. It **consumes** civ-2 identity (Increment 1,
> read-only) and Lineage (Increment 3 `LineageStatus`, provided as input); it never **determines**
> lineage or classification. It mutates nothing, rewrites no civ-1 IDs, and touches no accepted
> evidence/baseline/records. Governance context: `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`, Increment
> 1–3 acceptance records.
>
> **This tooling proposes mappings. It does not migrate authority.**

## Objective

Build deterministic, read-only tooling that proposes how the authoritative civ-1 candidates map to the
proposed civ-2 identities, producing **migration evidence** for governed review.

## Dependency direction (enforced)

`Candidate Identity → Lineage → Classification`. Migration **consumes** Identity + Lineage (the linkage
with its `lineageStatus` is an INPUT); it never determines lineage or classification.

## Mapping classifications (exactly five)

`oneToOne · oneToMany · manyToOne · unmapped · ambiguous`. **Every old candidate appears** in the
output; nothing disappears (duplicates are surfaced, not dropped).

## Output (per mapping)

`oldCandidateId · proposedNewIds · mappingClassification · lineageStatuses · reason · evidence ·
reviewRequired`.

## Behavior (as built)

| Case | Behavior | reviewRequired |
|---|---|---|
| oneToOne | only when deterministic (single link, unique new id, deterministic lineage) | **false** |
| oneToMany (split) | always review | true |
| manyToOne (merge) | always review | true |
| ambiguous (identity or lineage) | ambiguity preserved, never downgraded; **no fabricated id** | true |
| unmapped | remains **visible** | true |

**Never fabricate IDs** (proposed IDs come only from civ-2; `null` when ambiguous). **Never invent
lineage** (lineage is consumed input). **Never downgrade ambiguity.**

## Result classification (no percentages)

| Finding | Classification |
|---|---|
| Deterministic one-to-one mapping | **Proven** |
| one-to-many / many-to-one always route to review | **Review Required** |
| Ambiguous identity / ambiguous lineage → ambiguous | **Ambiguous by Design** |
| Unrelated lineage on a single link → surfaced for review (not silent one-to-one) | **Review Required** |
| Unmapped remains visible | **Proven** |
| Duplicate old IDs surfaced (both appear, review) | **Proven** |
| Duplicate proposed new IDs (many-to-one) surfaced | **Proven** |
| Deterministic across repeated runs / shuffled inputs | **Proven** |
| Append-only (old IDs echoed; inputs immutable) | **Proven** |
| CLI refuses output paths targeting accepted v1.0 evidence (exit 2, writes nothing) | **Proven** |
| Actually performing migration / switching authority | **Intentionally Unsupported** |
| Wiring into production / Increment 5 corpus rerun / new baseline | **Deferred** |

## Preservation (proven)

- **civ-1 IDs unchanged** — echoed as `oldCandidateId`, never altered.
- **Accepted evidence / acceptance records / baseline unchanged** — the tooling reads only its provided
  input; the CLI **refuses** to write into accepted v1.0 locations (verified: exit 2, `be-3` tree
  unchanged during tests).
- **Append-only** — output is new evidence; no prior record is rewritten.
- **Deterministic** — byte-identical across repeated runs and shuffled inputs; review-queue ordering is
  deterministic (sorted by `oldCandidateId`).
- **Immutability of inputs** — frozen `old`/`linkage` inputs are accepted without mutation.
- **No authority switch** — the report is inert; `civ-1` remains authoritative, `civ-2` non-authoritative.

## Determinism

Output is byte-identical across repeated runs, shuffled inputs, process restarts, and normalized
equivalent inputs (identity via canonical serialization + SHA-256; migration sorts old by `oldId` and
links by `newIndex`).

## No stop-condition was triggered

No rewriting of civ-1 artifacts, no change to civ-2, no change to compatibility semantics, no lineage
inference inside migration, no classification change, no baseline acceptance/replacement, no production
integration, no Increment 5 or Blocking-Mode work was required.

## Scope confirmation

Added files only: `lib/governance/be3-candidate-migration.ts`,
`scripts/diag/be3-candidate-migration.ts`, `tests/unit/governance/be3-candidate-migration.test.ts`, and
this report. Increment 1 (`be3-candidate-identity.ts`), Increment 2
(`be3-compatibility-contract.ts`), and Increment 3 (`be3-candidate-lineage.ts`) are consumed **read-only
via their existing exports** and are **byte-identical/unchanged**. Not wired into anything;
non-authoritative.
