# BE-3 Candidate Identity Hardening — Increment 1 Acceptance Record

> **Status: ACCEPTED WITH OBSERVATION** (founder-accepted 2026-07-29). Accepts the **isolated,
> non-authoritative** `civ-2` identity capability delivered by Increment 1 (PR #22, `ac68ebe` →
> `4f12cef`). **No tag is created and `civ-2` is not authoritative** — hardened identity becomes
> authoritative only after a new candidate baseline is reviewed, accepted, merged, verified, and
> tagged (Increment 5). Governance context: `CANDIDATE_IDENTITY_INCREMENT1_REPORT.md`,
> `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`, [[crowdexpanse-be-lifecycle]].

## What was accepted

The `civ-2` identity module + CLI + tests (14/14) + implementation report + reproduction fixture,
merged read-only and non-authoritative (`lib/governance/be3-candidate-identity.ts` etc.). The candidate
classifier, compatibility logic, accepted baselines, and evidence artifacts remain untouched; `civ-1`
remains authoritative.

## Proven

- `civ-2` is **classification-independent**; IDs are **namespaced and version-visible** (`C-civ2-…`).
- Canonical identity **excludes** classification, role, status, **raw line**, timestamps, and baseline
  state.
- **Deterministic** generation via canonical serialization + SHA-256 (byte-identical, order-independent).
- Rule aliases are **canonicalized or rejected**; repository paths **normalized without machine-specific
  absolute roots**; **meaningful subject distinctions preserved**.
- Context-anchored occurrences are **stable** through the tested insertion, removal, reorder, split, and
  collapse scenarios.
- **Indistinguishable duplicates become `ambiguous`**; invalid inputs are **rejected** — never coerced
  into misleading identity.
- Existing classification, compatibility, baselines, and accepted evidence remain **untouched**.

## Observation (governed)

> **Durable identity is proven where stable distinguishing context exists. Indistinguishable duplicate
> occurrences intentionally remain ambiguous until an authorized upstream context strategy is proven.**

Consequences held until a later authorized increment:
- context-distinguishable occurrences may receive **resolved** `civ-2` identities;
- **anchorless identical duplicates must remain `ambiguous`**;
- **ambiguity must not be converted into ordinal identity later** merely to increase automation.

This is an **implementation observation, not a failure** — it is an explicit upstream-evidence
dependency for later work.

## Boundaries this acceptance does NOT authorize

`civ-2` is **not authoritative** and not wired into anything. Not authorized: Increment 2 (compatibility
integration/suspension); Increment 3 (rename / baseline-evolution / reintroduction); Increment 4
(migration); Increment 5 (corpus rerun + new-baseline acceptance/tag); tagging `civ-2`; Blocking Mode
planning. `civ-1` remains authoritative.

## Artifacts

| File | Role |
|---|---|
| `lib/governance/be3-candidate-identity.ts` | civ-2 identity module (non-authoritative) |
| `scripts/diag/be3-candidate-identity.ts` | diagnostic CLI |
| `tests/unit/governance/be3-candidate-identity.test.ts` | 14 focused/property tests |
| `CANDIDATE_IDENTITY_INCREMENT1_REPORT.md` | implementation report |
| `CANDIDATE_IDENTITY_INCREMENT1_ACCEPTANCE.md` | this acceptance record |
| `fixture-inputs.json` | deterministic reproduction fixture |

**No tag** is associated with this acceptance by design; `civ-2` remains non-authoritative pending the
Increment-5 baseline.
