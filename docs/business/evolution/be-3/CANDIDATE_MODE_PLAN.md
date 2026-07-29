# BE-3 Candidate Mode — Plan (planning)

> **Status: PLANNING — for review. No implementation.** Candidate mode is **non-blocking**. Bounded to
> the accepted v1.0 anchors and the accepted advisory baseline `be3-prevention-advisory-v1.0` (@
> `b586efc`). **Blocking CI, enforcement, remediation, and Phase 4 remain unauthorized.** Planning
> begins with a finding-identity re-review (§1). Governance context: `PHASE3_PREVENTION_PLAN.md`,
> `prevention/BE3-PREVENTION-ADVISORY-v1.0.md`, [[crowdexpanse-be-lifecycle]].

## 1. Finding-identity re-review

The advisory identity is **`(ruleId, file, matched)` + per-file occurrence count** — line-insensitive
by design. Advisory is report-only (a human reads every line), so that model is safe there. Candidate
mode makes findings **review-impacting**, so the model must be re-tested against harmless movement
*and* drift-evasion. The governing question:

> **Can this identity distinguish genuinely new drift from harmless movement without letting drift
> evade detection?**

| Case | Current model behavior | Risk | Candidate-mode handling |
|---|---|---|---|
| Line movement, no semantic change | same key, count unchanged → **grandfathered** | none | `existing` (correct) |
| File rename / move | `file` changes → old key "removed", new key "added" | **FP**: harmless move looks new | use **git rename detection** → classify `moved`, not `candidate-new` |
| Identifier rename, still non-canonical (`matchKey`→`matchToken`) | `matched` changes → old removed, new added | **ambiguous**: mutated existing debt vs new | classify `ambiguous` → **human judgment**; never auto-new, never auto-grandfather |
| Duplicated occurrence added / removed | count ↑ → new; count ↓ → resolved | correct for pure add/remove | `candidate-new` / `resolved` |
| Formatting / generated-code change | token + count unchanged → grandfathered; generated files out of detector scope | low | `existing`; flag generated paths in report |
| One token, different semantic contexts (same file) | `(ruleId,file,matched)`+count collapses distinct uses | **FN**: a new *semantic* violation can hide behind an unchanged count | classify `ambiguous` when count stable but positions/context changed → human review |
| Finding split across multiple lines | matched text may fragment per scanner | detection fidelity | normalize matched span; `ambiguous` if fragmented |
| Deleted + recreated file | findings removed then re-added | **FP/FN**: looks new; or masks a real change | `moved`/`ambiguous` via rename+content compare |
| Case change (`Pipeline`→`pipeline`) | case-sensitive `matched` → different key | rule-dependent (may be a real fix or evasion) | per-rule case policy; default `ambiguous` |
| Path aliases / symlinks | same file via two paths → two `file` keys | **FN evasion** / duplication | **canonicalize paths** (realpath) before keying |
| Baseline finding removed **and** materially-equivalent violation appears elsewhere | net count may be stable → **no change detected** | **FN — drift evasion (the key hole)** | when a baseline key disappears *and* a same-`(ruleId, class)` appears elsewhere, classify `ambiguous` (not silently netted) → human review |

**Re-review conclusion.** The advisory identity is adequate for the accepted **advisory** baseline and
**must not be silently changed** (a change requires a new baseline / versioned migration — §3). For
**candidate** mode it is *insufficient on its own* to gate merges: file moves and within-file
remove-and-re-add can produce false positives and, more importantly, **drift-evasion false negatives**.
Therefore candidate mode does **not** rely on the raw model to auto-decide; it **layers a richer
classifier** (`existing / candidate-new / moved / ambiguous / resolved`) with **rename detection**,
**path canonicalization**, and **human-in-the-loop for `ambiguous`** — and, because candidate mode is
**non-blocking**, an uncertain case becomes a *review signal*, never a build failure. Closing the
FN/evasion gaps to a provable standard is a **precondition for any future blocking mode** (§5), not for
candidate.

## 2. Candidate-mode policy

Candidate mode:
- **evaluates pull-request changes** — runs the frozen detector on the PR head and compares to the
  accepted advisory baseline;
- **identifies candidate new drift** (`candidate-new`), distinguishing it from `existing`, `moved`,
  `resolved`, and `ambiguous`;
- **remains strictly non-blocking** — produces a **review signal + audit artifact**, never a CI failure;
- **requires human judgment for `ambiguous`** identity cases.

Candidate mode **must not**: silently reclassify existing debt; convert uncertain matches into blocking
failures; or mutate the accepted baseline.

## 3. Compatibility behavior (contract update)

The **Prevention Compatibility Contract** remains mandatory and gains one field. Candidate evaluation
**suspends** (reports, does not evaluate) when **any** accepted identity changes:

`detectorVersion` · `ruleSetHash` · `scopeHash` · `measurementSeriesId` · `baselineTag` · **`findingIdentityVersion`** *(new)*.

`findingIdentityVersion` names the identity **algorithm**. A change to it **requires a new advisory
baseline or an explicitly approved migration — never a silent update**. Suspension is fail-safe for the
developer (non-blocking) and fail-loud for governance (a new baseline acceptance is required to resume).

## 4. Output and audit schema

Deterministic JSON is authoritative; a human report and an **append-only audit trail** are derived.
Each candidate finding carries:

`candidateId` · `ruleId` · `lId` · `file` + `location` · `matched` · `baselineIdentity` ·
`currentIdentity` · `classification` ∈ {`existing`, `candidate-new`, `moved`, `ambiguous`, `resolved`} ·
`explanation` · `confidence` (0–1) · `reviewerDecision` (nullable until a human decides) ·
`exceptionRef` (nullable).

Envelope also records: `findingIdentityVersion`, all compatibility keys (§3), `baselineTag`,
`scannedCommit`/PR head, and per-classification counts. **Zero silent reclassification** — every
classification and any later reviewer decision is a distinct audit entry.

## 5. Governance transitions

```
Advisory (accepted)  →  Candidate (non-blocking)  →  Blocking (separate gate)
```

Candidate mode is **non-blocking**. Moving **candidate → blocking** requires a **separate governed
decision** plus: **accepted candidate evidence**; **reviewed identity accuracy**; a **false-positive /
false-negative analysis** (the §1 FN gaps closed to an agreed standard); a **documented exception +
emergency-bypass process**; and **rollback readiness**. Nothing in this plan authorizes blocking.

## 6. False-positive / false-negative risks

- **False positives (harmless → looks new):** file rename/move, formatting, identifier rename of
  *existing* debt. Mitigation: `moved`/`ambiguous` classes + rename detection + human review; and
  candidate mode is non-blocking, so an FP costs a review, not a broken build.
- **False negatives (drift evades):** within-file remove-and-re-add with stable count; path
  aliases/symlinks; delete+recreate; a token reused in a new semantic context under an unchanged key.
  Mitigation: path canonicalization; classify count-stable-but-moved and disappear-plus-equivalent as
  `ambiguous` (surfaced, not netted). **Because candidate is non-blocking, an FN here only misses a
  review signal — it cannot wrongly block. But these FN gaps must be provably closed before blocking
  is even proposed** (§5).

## 7. Acceptance criteria

1. **Deterministic** classifier; identical inputs → byte-identical output.
2. **Compatibility contract enforced**, including `findingIdentityVersion`; any mismatch → suspend.
3. **Case matrix (§1) covered by tests** — each case classifies into the intended
   `existing/candidate-new/moved/ambiguous/resolved`.
4. **Never blocks; never silently reclassifies existing debt;** `ambiguous` → human review signal.
5. **Append-only audit artifact;** every classification + reviewer decision has an entry + explanation.
6. **Read-only / in-scope:** no detector/rules/scope change; no CI enforcement; no remediation.

## 8. Explicit non-goals

No blocking CI; no enforcement/merge gating; no remediation or renames; no detector/rules/scope change;
**no silent change to the accepted finding-identity** (only a versioned, gated migration); no auto-
conversion of `ambiguous` into a failure; no Phase 4.

## 9. Stop conditions

**Planning only** — stop after this document for review. On approval, the *only* implementation target
is the **non-blocking candidate classifier + review signal + audit artifact**; the candidate→blocking
transition stays behind its own separate governed gate (§5).

## Proposed implementation artifacts (only if approved)

- `lib/governance/be3-language-candidate.ts` — pure classifier: detector-JSON(PR head) × accepted
  advisory baseline → classified candidate findings, enforcing the compatibility contract.
- `scripts/diag/be3-language-candidate.ts` — CLI: canonical JSON + derived report + audit artifact;
  non-blocking (always exit 0).
- `tests/unit/governance/be3-language-candidate.test.ts` — the §1 case matrix + suspend + determinism.
- **No CI wiring, no product/schema/API/UI/prompt changes.**

---

*Bounded to the accepted v1.0 anchors + advisory baseline. Planning only — stop for review.*
