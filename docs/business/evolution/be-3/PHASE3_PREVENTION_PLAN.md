# BE-3 Phase 3 — Prevention Plan (planning)

> **Status: PLANNING — for review. No implementation.** Defines how **new** language drift is
> prevented while the **accepted existing debt is left untouched (grandfathered)**. Bounded to the
> accepted v1.0 anchors: `be3-detector-v1.0`, `be3-evidence-baseline-v1.0`,
> `be3-measurement-baseline-v1.0` (@ `28df664`). **Advisory-first; blocking CI is NOT enabled by this
> plan.** Governance context: `ENFORCEMENT_PLAN.md` (Detect→Measure→**Prevent**→Reduce, frozen),
> `PHASE2_MEASUREMENT_PLAN.md`, [[crowdexpanse-be-lifecycle]].

## Design principle

Prevention **stops new drift; it never touches accepted debt and never remediates.** It is a
read-only classifier layered on the frozen detector + accepted baseline: every error finding is sorted
into **grandfathered** (in the accepted baseline), **new drift** (a candidate for prevention), or
**informational** (never enforced). Reducing existing debt is **Phase 4** and out of scope here.

## 1. Prevention policy

- **What counts as "new drift":** an **error-severity** finding whose stable identity is **not in the
  accepted v1.0 baseline set**. The baseline set is the accepted finding population behind
  `be3-measurement-baseline-v1.0` (the 117 accepted evidence findings).
- **Finding identity (baseline-stability decision — for review):** matching on raw `(ruleId, file,
  line)` is fragile — unrelated edits renumber lines and would masquerade as "new drift." The plan
  proposes a **stable identity** = `(ruleId, file, matched)` with an **occurrence count per
  `(ruleId, file)`**. New drift = a *new* `(ruleId, file, matched)` key **or** a count **increase**
  for an existing key. This tolerates pure line renumbering while still catching a genuinely new
  occurrence in an already-known file. (Alternative identities — content fingerprint, AST anchor — are
  noted for the review to choose; nothing is implemented until chosen.)
- **Enforceable Rule IDs:** only rules that are **both** (a) `error` severity **and** (b) have detector
  coverage in the accepted v1.0 scope — i.e. `R-HOM-001/002/003`, `R-SYN-002/003/004`, `R-RET-001`
  (L0–L6).
- **Informational (never enforced):** boundary rules `R-BND-*` (owned by BE-4/BE-5) and any `error`
  rule **without** v1.0 detector coverage (e.g. `R-PLAT-001` has no v1.0 scanner). Informational
  findings are reported, never blocked, never counted as drift.

## 2. Prevention Compatibility Contract (invariant)

A finding may be evaluated against the accepted prevention baseline **only if ALL** of the following
match the accepted anchor:

```
detectorVersion  == accepted   AND
ruleSetHash      == accepted   AND
scopeHash        == accepted   AND
measurementSeriesId == accepted AND
baselineTag      == be3-measurement-baseline-v1.0
```

If **any** differ:

```
preventMode = suspended
reason      = "Prevention baseline incompatible. New baseline acceptance required."
```

- Composes with the **Series Compatibility Contract** (Phase 2): if the detector evolves (v1.1),
  `measurementSeriesId`/`ruleSetHash`/`scopeHash` change → prevention **suspends** until a *new*
  measurement baseline is accepted. **CI can never block work merely because the detector changed.**
- Suspension is **fail-safe for the developer** (does not block) but **fail-loud for governance** (a
  suspended state is reported and requires a new baseline acceptance to resume).

## 3. Baseline model

- **Prevention baseline** = the accepted v1.0 measurement baseline (`be3-measurement-baseline-v1.0` @
  `28df664`), referencing the accepted evidence finding set (**117**). Immutable.
- **Existing accepted findings are grandfathered** — never blocked, never reclassified, never
  re-surfaced as new.
- **Only findings outside the accepted baseline set are candidates for prevention.**
- Grandfathering is **explicit and audited** (the baseline set is content-addressed, not re-derived
  ad hoc).

## 4. Prevention model — staged workflow with governance gates

Three CI modes, each entered only through an explicit governed gate; plus a suspended state and an
audited bypass:

| preventMode | CI effect | Purpose | Gate to enter |
|---|---|---|---|
| **suspended** | none (reports why) | compatibility contract failed | automatic (contract); exits via new-baseline acceptance |
| **advisory** *(start)* | never fails CI | build trust; report new drift | this plan's approval (advisory only) |
| **candidate** | never fails CI; computes *what it would block* | shadow/dry-run; validate zero false positives | governed approval after advisory data reviewed |
| **blocking** | **fails CI on new drift only** | enforce | **separate** governed approval: scope (which rule IDs block) + rollback + exception process defined |

**Advisory-first workflow:** run the detector, classify (grandfathered / new / informational), report
new drift, **exit 0 always**. **Transition path:** advisory → candidate → blocking, each a distinct
governed decision; no automatic promotion. **Emergency bypass:** a labeled, justified, audited override
(e.g. an explicit CI label + written reason) with mandatory post-hoc review — **never silent**.

## 5. CI behavior (per mode)

- `suspended` → run, report incompatibility, **exit 0**.
- `advisory` → report new drift + existing debt separately, **exit 0**.
- `candidate` → additionally report the *would-block* set, **exit 0**.
- `blocking` → **exit nonzero** iff there is ≥1 **new-drift, enforceable** finding; grandfathered and
  informational findings **never** cause failure.
- `bypass` → explicit, labeled, audited; records who/why; triggers post-hoc governance review.

## 6. Reporting

- **New drift reported separately** from existing debt (its own section + count).
- **Existing accepted debt reported separately**, unchanged from the measurement baseline.
- **Zero silent reclassification:** a finding never moves between grandfathered / new / informational
  without an **audit entry**; the classifier is deterministic and its inputs are content-addressed.
- Machine-readable JSON is authoritative; human report derived. Every report states `preventMode`, the
  `baselineTag`, and the compatibility result.

## 7. Governance

- **Required approvals:** each mode transition (advisory→candidate→blocking) is a **founder governed
  decision**; blocking additionally requires a defined enforce-scope + rollback + exception process.
- **Audit trail:** every prevention decision — classification, mode change, block, bypass, exception —
  recorded immutably (append-only), keyed to the `baselineTag` and commit.
- **Rollback procedure:** de-escalate `blocking → candidate → advisory` (or to `suspended`) via a
  documented, audited step; blocking is always reversible without code changes.
- **Exception process:** a **per-finding waiver** with written justification, an **expiry**, and an
  audit entry; waivers are visible, never silent, and never mutate the baseline.

## 8. Acceptance criteria (for the eventual implementation)

1. **Deterministic** classifier; identical inputs → byte-identical output.
2. **Compatibility contract enforced:** any of detector/ruleSet/scope/series/baselineTag mismatch →
   `preventMode=suspended` with the exact reason string; no evaluation occurs.
3. **Grandfathering exact:** all 117 accepted findings classify as grandfathered; none as new.
4. **New-drift detection:** a synthetic violation outside the baseline classifies as new drift; a pure
   line-renumbering of an existing finding does **not**.
5. **Informational passthrough:** `R-BND-*` and coverage-less rules never block.
6. **Advisory never fails CI;** blocking fails **only** on enforceable new drift.
7. **Zero silent reclassification:** every classification change has an audit entry.
8. **Read-only / in-scope:** no detector/rules/scope change, no remediation, no schema/API/UI/prompt/
   persistence change.
9. Tests cover: suspend-on-mismatch, exact grandfather, new-drift, line-shift tolerance, informational
   passthrough, mode gating, bypass auditing.

## 9. Explicit non-goals and stop conditions

**Non-goals — this plan authorizes NONE of:** detector expansion; remediation; renames; schema changes;
API/UI changes; prompt changes; persistence changes; **blocking CI**; Phase 4 work.

**Stop conditions:** **planning only** — stop after this document for review. No implementation begins
until it is reviewed and approved. Even on approval, the *only* initial implementation target is
**advisory mode**; `candidate` and `blocking` remain behind their own separate governed gates.

## Proposed implementation artifacts (only if this plan is approved — advisory mode first)

- `lib/governance/be3-language-prevent.ts` — pure, read-only classifier over a detector JSON + the
  accepted baseline (grandfathered / new / informational), enforcing the Prevention Compatibility
  Contract.
- `scripts/diag/be3-language-prevent.ts` — CLI emitting canonical JSON + derived report; `preventMode`
  defaults to `advisory`.
- `tests/unit/governance/be3-language-prevent.test.ts` — per the acceptance criteria.
- No product code/schema/migration/API/UI/prompt changes; **no blocking CI wiring.**

---

*Bounded to the accepted v1.0 anchors. Planning only — stop for review before any implementation.*
