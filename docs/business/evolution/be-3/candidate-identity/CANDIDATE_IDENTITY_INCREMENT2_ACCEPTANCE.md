# BE-3 Candidate Identity Hardening — Increment 2 Acceptance Record

> **Status: ACCEPTED** (founder-accepted 2026-07-29). Accepts the **isolated, diagnostic,
> non-authoritative** compatibility contract delivered by Increment 2 (PR #24, `2b9cd1c` → `07e8b72`).
> **No tag is created.** `candidateIdentityVersion` remains **non-authoritative** until the full
> governed sequence — migration, corpus rerun, baseline acceptance, merge, verification, and tagging —
> is completed. Governance context: `CANDIDATE_IDENTITY_INCREMENT2_REPORT.md`,
> `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`, [[crowdexpanse-be-lifecycle]].

## What was accepted

The standalone compatibility contract (`lib/governance/be3-compatibility-contract.ts` + CLI + tests
13/13 + implementation report), merged read-only and **not wired into** the candidate classifier.
`civ-1` remains authoritative; `civ-2` and candidate classification are unchanged.

## Proven

- Compatibility evaluation is **pure, deterministic, and side-effect-free**.
- All **eight** dimensions are evaluated **independently**.
- Every incompatibility reports **field, expected value, actual value, suspension reason**.
- **Multiple incompatibilities are preserved, not collapsed.**
- **Deterministic precedence** (identity-version → detector/rule/scope → measurement → baseline).
- **Suspension occurs before** candidate evaluation; **no candidate classification** is produced after
  suspension; **no ID regeneration**; **no baseline mutation**.
- Diagnostic CLI is **non-blocking** (exit 0); repeated execution is deterministic.
- The compatibility layer is **not yet wired into production behavior**.

## Future enhancement (non-blocking observation)

A later planning increment may model compatibility as a **structured compatibility state** rather than
a boolean:

```
CompatibilityStatus = compatible | suspended | incompatible
```
with `suspended` carrying an **immutable list of incompatibilities**. This preserves future
extensibility without changing the current implementation. **Recorded as a non-blocking enhancement
note — not a prerequisite and not implemented here.**

## Boundaries this acceptance does NOT authorize

No tag; `candidateIdentityVersion` is **not authoritative**; the contract is **not wired** into the live
classifier or enforcement. Not authorized: Increment 3 (rename / baseline-evolution / reintroduction),
Increment 4 (migration), Increment 5 (corpus rerun + new-baseline acceptance/tag), and Blocking Mode
planning. `civ-1` remains authoritative.

## Artifacts

| File | Role |
|---|---|
| `lib/governance/be3-compatibility-contract.ts` | compatibility contract (diagnostic, non-authoritative) |
| `scripts/diag/be3-compatibility-contract.ts` | diagnostic CLI |
| `tests/unit/governance/be3-compatibility-contract.test.ts` | 13 focused tests |
| `CANDIDATE_IDENTITY_INCREMENT2_REPORT.md` | implementation report |
| `CANDIDATE_IDENTITY_INCREMENT2_ACCEPTANCE.md` | this acceptance record |

**No tag** by design; the contract stays diagnostic and non-authoritative pending the Increment-5 baseline.
