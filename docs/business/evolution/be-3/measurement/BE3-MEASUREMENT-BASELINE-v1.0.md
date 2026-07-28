# BE3-MEASUREMENT-BASELINE-v1.0 — Acceptance Record

> **Status: ACCEPTED** (founder-accepted 2026-07-28). Records the governed acceptance of the BE-3
> Phase 2 (Measure) first measurement. The **JSON is the authoritative artifact**; the `.report.md`
> is a derived human render; this file records the decision. Governance context:
> `../PHASE2_MEASUREMENT_PLAN.md`, `../ENFORCEMENT_PLAN.md`, [[crowdexpanse-be-lifecycle]].

## What was accepted

The first deterministic measurement of the accepted v1.0 evidence baseline, produced by the Phase 2
engine (`lib/governance/be3-language-measure.ts`) as a pure, read-only function of the accepted
detector JSON (`be3-evidence-baseline-v1.0`).

## Provenance (content-addressed — permanently reproducible)

| Field | Value |
|---|---|
| Measurement spec | `BE3-MEASURE-v1` |
| `measurementSeriesId` | `41f04b6234d74e194ab5541f18e9c7318bf252861d9805f27a3d2cc2787b5808` |
| Series | detectorVersion `be3-detector-v1.0` · ruleSetHash `1d107d5a…` · scopeHash `e84d4131…` |
| Baseline | `be3-evidence-baseline-v1.0`, errorFindingCount **117** |
| Consumed detector report digest | `e25b54cf26d5883cf67875608e34b77b141495306cac9b4a6973b1415df48d22` |
| Detector scan commit | `3b71401` |
| Metrics | errorFindings **117** · distinctDeviations **19** · remediationSurface **19** · distinctFiles **33** · burndownPct **0** · densityPerKSloc **2.408151** · scannedSloc 48585 |

## Acceptance statement (governed)

This measurement is **ACCEPTED as the official v1.0 measurement baseline**, on the following findings:

1. **Reproducible and byte-identical** across repeated runs (independently regenerated from the
   accepted detector JSON; identical `measurementSeriesId` and metrics).
2. **Reconciles exactly** to the accepted **117-finding** evidence baseline (`errorFindings == 117`;
   `burndownPct == 0` at baseline by construction).
3. **Series Compatibility Contract verified** — an incompatible detector series yields
   `compatibleWithPrevious = false`, `trend = "unavailable"`, reason *"measurement series changed;
   new baseline required"*; a cross-series trend cannot be computed.
4. **Metrics are repetition-honest** — 117 *locations* collapse to **19 distinct deviations** across
   33 files (remediation surface 19), and the model **does not fabricate a full-repository alignment
   percentage**; density is reported only as context.
5. **Coverage remains bounded** by detector **v1.0's accepted, conservative scope** (a known
   floor, carried forward from `be3-evidence-baseline-v1.0`); this is not a claim of exhaustive
   repository coverage.
6. **Accepted as the official v1.0 measurement baseline.**
7. **The Phase 3 enforcement ("block-new-only") baseline remains NOT approved** — establishing it is a
   separate, later governed decision.

```
Phase 2 measurement baseline     ACCEPTED (official v1.0)
        ↓
Phase 3 enforcement baseline     NOT APPROVED  (separate future decision)
```

## Boundaries this acceptance does NOT authorize

Beginning Phase 3 (Prevent); establishing a blocking baseline; altering detector coverage/rules/scope;
introducing blocking CI; or performing any remediation. Each remains separately gated.

## Artifacts in this baseline

| File | Role |
|---|---|
| `BE3-MEASUREMENT-BASELINE-v1.0.json` | authoritative canonical measurement |
| `BE3-MEASUREMENT-BASELINE-v1.0.report.md` | derived human-readable report |
| `BE3-MEASUREMENT-BASELINE-v1.0.md` | this acceptance record |

On merge + `verify-merge.sh --mirror-mode ancestor` verification, the merged commit is bound
permanently by the annotated tag **`be3-measurement-baseline-v1.0`**.
