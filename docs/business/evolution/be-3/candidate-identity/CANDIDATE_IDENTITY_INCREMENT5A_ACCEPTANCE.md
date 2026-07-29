# BE-3 Candidate Identity Hardening — Increment 5A Acceptance Record

> **Status: ACCEPTED WITH OBSERVATION** (founder-accepted 2026-07-29). Accepts the **isolated, read-only,
> deterministic, NON-AUTHORITATIVE** versioned evidence-container foundation delivered by Increment 5A
> (PR #31, `e6f603f` → merge `d247728`, verify PASS 12/12 with `--mirror-mode ancestor`). **No tag is
> created.** No corpus was rerun, no readiness evidence generated, no baseline proposed or accepted, and
> no authority switched; `civ-1` remains authoritative, `civ-2` remains non-authoritative. Governance
> context: `CANDIDATE_IDENTITY_INCREMENT5A_REPORT.md`, `CANDIDATE_IDENTITY_INCREMENT5_PLAN.md` §3a,
> `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`, [[crowdexpanse-be-lifecycle]].
>
> **The Evidence Manifest establishes reproducibility metadata. It does not authorize a baseline or an
> authority switch.**

## What was accepted

The versioned evidence-container foundation (`lib/governance/be3-evidence-manifest.ts` + diagnostic CLI +
tests 23/23 + implementation report). It introduces `migrationSchemaVersion` (`msv-1`) — independent of
`findingIdentityVersion`, `candidateIdentityVersion`, and `classificationAlgorithmVersion` — and an
immutable, versioned Evidence Manifest with deterministic construction, canonical serialization, SHA-256
digest, and compatibility validation that **suspends** rather than falls back. This discharges the
Increment 4 acceptance observation calling for an independent `migrationSchemaVersion`.

## Proven

- `migrationSchemaVersion` (`msv-1`) is introduced as an **independent version identifier**.
- The Evidence Manifest is **immutable and versioned**.
- Manifest construction is **deterministic**; repeated execution and shuffled input yield **byte-identical**
  canonical output and digest.
- Canonical serialization and SHA-256 digest generation are implemented.
- Manifest validation **suspends rather than falls back** on any governed-identifier mismatch, reporting
  every incompatibility in fixed precedence order.
- **Unsupported schema versions are rejected** (no automatic schema upgrade).
- **Unknown or malformed fields are rejected deterministically** (explicit strict policy).
- `generatedAt` is **explicit input, not wall-clock time** — and is **provenance, not a compatibility
  field** (a differing timestamp alone never suspends). No clock/random/environment reads.
- **Protected accepted-evidence paths are refused** before any write.
- **No baseline proposal** can be produced (`baselineProposal` structurally pinned to `none`).
- **No authority change** can be produced (`authorityChange` structurally pinned to `none`).
- Increments 1–4 modules remained **byte-identical**; accepted evidence, baselines, detector, classifier,
  compatibility, lineage, and migration were **untouched**; all four files were additive.

## Observation (governed)

> **The Evidence Manifest establishes deterministic execution provenance. A future
> `evidencePackageVersion` may independently version the canonical evidence bundle without altering
> migration or identity semantics.**

Rationale — three distinct concerns should eventually carry independent versions:

- **Evidence Manifest** — describes the **execution environment / provenance** of an evidence run.
- **Migration Schema (`migrationSchemaVersion`)** — describes **migration semantics**.
- **Evidence Package Version (`evidencePackageVersion`)** — describes the **structure of the canonical
  evidence bundle itself**.

Recorded as a **non-blocking future refinement**; **not** implemented here and **not** a prerequisite for
this acceptance.

## Boundaries this acceptance does NOT authorize

No tag; no corpus rerun; no readiness-evidence generation; no baseline proposed or accepted; `civ-2` not
authoritative. **Not authorized:** Increment 5B (controlled corpus rerun + evidence production), new
baseline acceptance, tag creation, authority switch to `civ-2`, production integration, and Blocking Mode
planning. `civ-1` remains authoritative.

## Artifacts

| File | Role |
|---|---|
| `lib/governance/be3-evidence-manifest.ts` | versioned evidence-manifest module (`msv-1`; read-only, non-authoritative) |
| `scripts/diag/be3-evidence-manifest.ts` | diagnostic CLI |
| `tests/unit/governance/be3-evidence-manifest.test.ts` | 23 focused tests |
| `CANDIDATE_IDENTITY_INCREMENT5A_REPORT.md` | implementation report |
| `CANDIDATE_IDENTITY_INCREMENT5A_ACCEPTANCE.md` | this acceptance record |

**No tag** by design; the evidence-container foundation stays diagnostic and non-authoritative. The next
governed decision is whether to authorize **Increment 5B** (controlled corpus rerun + evidence
production) — that execution, not this foundation, determines whether the evidence supports proposing a
new candidate baseline.
