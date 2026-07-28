# BE-3 Phase 2 — Measurement Plan (planning)

> **Status: PLANNING — for review. No implementation.** Bounded to the **accepted, tagged v1.0
> evidence package** exactly as it exists: detector `be3-detector-v1.0`, evidence
> `be3-evidence-baseline-v1.0` (117 error findings), conservative scope explicitly known to be a
> **coverage floor**. Governed by `ENFORCEMENT_PLAN.md` (Detect→Measure→Prevent→Reduce, frozen),
> `DETECTOR_SPEC.md`, `LANGUAGE_RULES.md`, `CANONICAL_GLOSSARY.md`. The **Phase 3 "block-new-only"
> baseline remains NOT approved**; nothing here establishes it.

## Design principle

Phase 2 **measures what the detector can prove — no more.** It consumes the detector's canonical
JSON (the same schema the v1.0 baseline uses) and computes stable, deterministic metrics on top.
Measurement **does not re-scan differently, does not change rules/scope, and does not remediate.** It
is a pure, read-only function of an existing detector output.

## 1. What exactly is being measured

The **language drift detected by BE3-DET within its v1.0 scope**, expressed three ways so no single
number is misleading:

- **Locations** — raw error findings (117 at baseline): *where* drift appears.
- **Distinct deviations** — unique `(ruleId, matched)` (and unique symbol) counts: *how many real
  things* drift, independent of repetition.
- **Burndown** — progress against the frozen v1.0 baseline of 117.

Explicitly **not** measured: total repository language alignment (the detector scope is a floor); the
Business Architecture's "Language ~65%" estimate is an *external architectural reference*, not
recomputed here (Phase 2 cannot, and must not pretend to, derive a full-repo denominator from v1.0).

## 2. Scoring formula and denominator

The v1.0 detector counts **violations only** — it does not enumerate *compliant* canonical usages, so
a true "compliant / (compliant+violations)" alignment percentage is **not computable from v1.0** and
will not be fabricated. Phase 2 therefore uses an **anchored burndown**, whose denominator is fixed
and honest:

```
v1.0 debt burndown %  =  (BASELINE_ERRORS − current_error_findings) / BASELINE_ERRORS
                          where BASELINE_ERRORS = 117   (frozen, = be3-evidence-baseline-v1.0)
```

- Denominator = **117**, frozen to the accepted baseline. At the baseline commit the burndown is
  **0%** by construction; it rises only as real violations are (later, in Phase 4) removed.
- Valid **only within the v1.0 series** (same detector + rules + scope — see §5/§6). It measures
  "share of the *v1.0-detected* debt closed," never "share of all language debt."
- Secondary, denominator-independent metric: **violation density** = error findings per 1,000
  in-scope scanned SLOC (stable, reproducible), reported as context, not as a score.
- A **true alignment %** (with a compliant-usage denominator) is explicitly deferred to a detector
  **v1.1** that also counts canonical usages (§6). Phase 2 records this as a known limitation, not a
  gap to paper over.

## 3. Representing repeated usages (e.g. L5's 70) without overstating debt

Every metric reports **both** location count and distinct-deviation count:

| Dimension | Meaning | L5 example (illustrative) |
|---|---|---|
| `findings` | locations (raw) | 70 |
| `distinctMatched` | unique matched tokens | e.g. `matchKey`, `OwnerMatchDecision`, `PropertyMatchDecision`… (a handful) |
| `distinctFiles` | files touched | the files those identifiers live in |
| `remediationSurface` | distinct symbols to change | small — the true architectural weight |

The **headline debt figure uses `remediationSurface` / distinct deviations, not raw locations**, so
"70 locations of a few identifiers" never reads as "70 independent conflicts." Raw locations are kept
for completeness and for Phase-3 baselining precision, but are labeled as *locations*, not *conflicts*.

## 4. Per-rule, per-L-ID, and repository-level metrics

- **Per-rule (`R-*`):** findings, distinctMatched, distinctFiles, severity.
- **Per-L-ID (`L0–L6`):** findings, distinctMatched, distinctFiles, remediationSurface, share of total.
- **Repository-level:** total error findings, total distinct deviations, total distinct files,
  burndown % (vs 117), violation density. Info/boundary (`R-BND-*`) counted separately and never
  folded into the error total.

## 5. Keeping trend comparisons valid across commits

Every measurement is **stamped with the exact versions it depends on** and is comparable only to
measurements sharing them:

- Recorded: `detectorVersion` (tag/commit), `ruleSetHash` (content-addressed glossary+rules+config
  blobs, as the detector already emits), `scopeHash`, and `scannedCommit`.
- **Series key = hash(detectorVersion, ruleSetHash, scopeHash).** A trend is a sequence of
  measurements **within one series**; deltas are only computed inside a series.
- **Determinism:** same `scannedCommit` + same series → byte-identical measurement (no clock/random;
  any timestamp is taken from the commit, not wall-time). This mirrors the detector's determinism and
  is what makes a delta meaningful rather than noisy.

### Series Compatibility Contract (invariant)

**Measurements never compare incompatible detector series.** Every measurement carries a
`measurementSeriesId` and, when a previous measurement is supplied, a `compatibleWithPrevious`
(`true|false`) with explicit `reasons` (any of: `detectorVersion changed`, `ruleSetHash changed`,
`scopeHash changed`, `baseline changed`). The measurement engine **refuses to compute a trend unless
the series is compatible** (identical series key and baseline). On an incompatible pair it emits, in
both JSON and the human report:

> `Trend unavailable — measurement series changed. New baseline required.`

This makes a false comparison — e.g. broadening the scanner (v1.0 → v1.1) and then reporting
"burndown improved 42%" — **impossible by construction**: a broader detector changes `ruleSetHash`/
`scopeHash`, flips `compatibleWithPrevious` to `false`, and blocks the delta. Cross-series movement is
only ever surfaced as an explicit, documented re-baseline (§6), never as a trend number.

## 6. How a future detector v1.1 starts a new series (never rewrites v1.0 history)

- A change to detector rules/scope changes `ruleSetHash`/`scopeHash` → a **different series key** →
  **series 2**. v1.0 measurements are immutable historical records and are **never** recomputed with
  v1.1 rules.
- Moving from v1.0 to v1.1 is an explicit, documented **re-baseline event** (its own governance step,
  like Phase-1 acceptance), not a silent overwrite. Reports show series lineage side by side; they do
  not splice a v1.1 point onto the v1.0 trend.
- This is what lets us broaden coverage later (the deferred "true alignment %") **without** falsifying
  the accepted v1.0 record.

## 7. Canonical output schema (deterministic)

Machine-readable **JSON is authoritative**; a human report is **derived** from it (never a separate
source of truth) — same discipline as Phase 1.

```jsonc
{
  "measurementSpec": "BE3-MEASURE-v1",
  "measurementSeriesId": "<hash(detectorVersion, ruleSetHash, scopeHash, baseline)>",
  "series": { "detectorVersion": "be3-detector-v1.0",
              "ruleSetHash": "<glossary+rules+config digest>", "scopeHash": "<digest>" },
  "compatibleWithPrevious": {           // present only when a previous measurement is supplied
    "value": true,
    "previousSeriesId": "<hash|null>",
    "reasons": []                        // e.g. ["ruleSetHash changed","scopeHash changed"] when false
  },
  "trend": null,                         // computed ONLY when compatibleWithPrevious.value === true;
                                         // else the string "Trend unavailable — measurement series changed. New baseline required."
  "scannedCommit": "<sha>",
  "baseline": { "ref": "be3-evidence-baseline-v1.0", "errorFindingCount": 117 },
  "repo": { "errorFindings": 0, "distinctDeviations": 0, "distinctFiles": 0,
            "remediationSurface": 0, "burndownPct": 0.0, "densityPerKSloc": 0.0 },
  "byRule": [ { "ruleId": "R-…", "findings": 0, "distinctMatched": 0, "distinctFiles": 0 } ],
  "byLId":  [ { "lId": "L0", "findings": 0, "distinctMatched": 0, "distinctFiles": 0,
                "remediationSurface": 0, "sharePct": 0.0 } ],
  "provenance": { "detectorReportDigest": "<sha256 of the consumed detector JSON>" }
}
```

Findings/sections are total-ordered; JSON keys sorted (byte-stable). The measurement records the
digest of the **detector JSON it consumed**, binding a measurement to its exact evidence input.

## 8. Phase 2 acceptance criteria

1. **Reconciles to the accepted baseline:** at the v1.0 baseline input, `repo.errorFindings == 117`
   and `burndownPct == 0.0`.
2. **Deterministic:** same input + same series → byte-identical JSON (proven by a repeat run).
3. **Repetition-honest:** L5 (and any repeated rule) reports locations *and* distinct/remediation
   counts; the headline debt figure uses distinct/remediation, not raw locations.
4. **Series-safe (Series Compatibility Contract):** **measurements never compare incompatible
   detector series.** Each measurement carries `measurementSeriesId` + `compatibleWithPrevious`
   (with reasons); a trend is computed **only** when the series is compatible, otherwise the engine
   returns `Trend unavailable — measurement series changed. New baseline required.` A test proves a
   v1.0-vs-simulated-v1.1 comparison refuses to produce a burndown delta.
5. **Read-only & in-scope:** consumes the detector JSON; changes no rules, scope, or source.
6. **Derived report:** human report generated from the JSON; tests cover metric math, determinism,
   series-keying, and baseline reconciliation.

## 9. Non-goals and stop conditions

**Non-goals (Phase 2 must NOT):** rename or remediate findings; alter schema, migrations, APIs, UI,
prompts, or persistence; change detector rules or scanner coverage; broaden detector scope; establish
a Phase-3 blocking baseline; introduce blocking CI; set targets/thresholds; fabricate a full-repo
alignment-% denominator.

**Stop conditions:** implementation stops after producing the **first measurement (v1.0 series) + its
derived report** and the tests, for review. No thresholds, no CI wiring, no v1.1 coverage work.

## Proposed implementation artifacts (only if this plan is approved)

- `MEASUREMENT_SPEC.md` (contract, like `DETECTOR_SPEC.md`) — may be folded into this doc on approval.
- `lib/governance/be3-language-measure.ts` — pure, read-only aggregator over a detector JSON.
- `scripts/diag/be3-language-measure.ts` — CLI emitting canonical JSON + derived report.
- `tests/unit/governance/be3-language-measure.test.ts` — baseline reconciliation, determinism,
  distinct-vs-location, series-keying.
- No product code/schema/migration/API/UI/prompt changes.

---

*Bounded to the v1.0 evidence package. Planning only — stop for review before implementation.*
