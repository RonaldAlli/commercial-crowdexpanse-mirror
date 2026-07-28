# BE3-EVIDENCE-BASELINE-v1.0 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-28).
> This document records the governed judgment for the Phase 1 (Detect) evidence package of BE-3.
> The **JSON is the authoritative evidence artifact**; the `.report.md` is a derived human render;
> this file records the acceptance decision. Governance context: [[crowdexpanse-be-lifecycle]],
> `../ENFORCEMENT_PLAN.md`, `../DETECTOR_SPEC.md`.

## What was accepted

The complete, deterministic output of the **BE3-DET v1.0** language detector, run against the merged
BE-3 baseline. It answers the sole Phase 1 objective:

> *Exactly where does every L0–L6 deviation **detectable by BE3-DET v1.0** exist?*

## Provenance (content-addressed — permanently reproducible)

| Field | Value |
|---|---|
| Detector | `BE3-DET` |
| Source commit scanned | `3b71401c633a59d387e7f890825ae4c84a8c4f06` |
| Glossary blob | `b1de80c7ac96c1d790a25186cad1dbd2d29ccb1a` (`../CANONICAL_GLOSSARY.md`) |
| Rules blob | `a185be064e4de9d48cb2bb9685ddeccc1af240b4` (`../LANGUAGE_RULES.md`) |
| Config blob | `cea0270d14f32bc8ec9375de1e328122fea8a60e` (`config/be3-language-detector.json`) |
| Scan scope | `includeExtensions` `.ts/.tsx/.prisma`; `ignoredPathFragments` `node_modules`, `.next*`, `dist`, `coverage`, **`docs/`** |
| Findings | **117 error / 0 info** |
| By L-ID | L0=8 · L1=2 · L2=6 · L3=8 · L4=2 · L5=70 · L6=21 |
| Determinism | verified byte-identical across independent runs; findings ordered `file→line→ruleId→matched` |

> Adding these evidence files under `docs/` does **not** change the detector's output — `docs/` is an
> ignored path — so the baseline remains reproducible from source commit `3b71401`.

## Acceptance observations (recorded verbatim)

1. The 117 findings are the complete output of the approved v1.0 detector scope, not a claim that
   every possible language deviation in the entire repository has been discovered.
2. Narrow includePaths create a known false-negative risk outside the scanned paths.
3. L5's 70 findings represent repeated use of a bounded set of identifiers, not 70 independent
   architectural conflicts.
4. Boundary-rule coverage remains incomplete because R-BND-* currently produces no informational
   findings.
5. The accepted baseline is suitable for Phase 2 measurement and detector comparison.
6. It is not yet authorized as the permanent Phase 3 "block-new-only" baseline. That authorization
   must wait until Phase 2 reviews detector coverage and decides whether broader scanning is required.

## Scope statement (explicit)

The 117 findings are **exhaustive only for detector v1.0's approved scan scope** (the extensions,
include-paths, and allow-lists in config blob `cea0270d…`). They are **not** a claim of exhaustive
semantic coverage of the repository, and they are **not yet approved** as the Phase 3 block-new
baseline.

```
Phase 1 evidence baseline      ACCEPTED (with observations)
        ↓
Phase 3 enforcement baseline   NOT YET APPROVED  (gated on a Phase 2 coverage review)
```

## Boundaries this acceptance does NOT authorize

Beginning Phase 2 (Measure); broadening detector behavior; remediating any finding; renaming
anything; or establishing the Phase 3 blocking baseline. Each remains separately gated.

## Artifacts in this baseline

| File | Role |
|---|---|
| `BE3-EVIDENCE-BASELINE-v1.0.json` | authoritative canonical evidence (117 findings) |
| `BE3-EVIDENCE-BASELINE-v1.0.report.md` | derived human-readable report |
| `BE3-EVIDENCE-BASELINE-v1.0.md` | this acceptance record |

On merge + `verify-merge.sh` verification, the merged commit is bound permanently by the annotated
tag **`be3-evidence-baseline-v1.0`**.
