# CRE Operating Workspace — UI Milestone 2 — Milestone-Level Acceptance Review

> **Status: REVIEW COMPLETE — RECOMMENDATION: REJECT (single, well-scoped test-isolation blocker).**
> Convened against verified `main 9c54e85`. Verification only — no implementation, no release, no deployment.
> This is the review report, **not** the final milestone acceptance record. Context:
> `UI_M2_INCREMENT{1,2,3,4}_ACCEPTANCE.md`, `UI_MILESTONE_2_PLANNING_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## Integrated verification (against `main 9c54e85`)

| Check | Result |
|---|---|
| Working tree clean, HEAD == 9c54e85 | ✅ |
| Clean production-style build | ✅ compiled successfully, 47/47 pages, `/guided-underwriting/[opportunityId]` present |
| Application typecheck (`tsc`) | ✅ 0 real-source errors |
| Scripts typecheck (`typecheck:scripts`) | ✅ clean |
| ESLint (full) | ✅ clean |
| Complete unit suite | ✅ PASS (128 files; branch ≥ 90%) |
| Guided Underwriting browser suite (Inc 1–4) | ✅ green in isolation |
| Milestone 1 regression | ✅ green |
| Navigation regression | ✅ green |
| Tenant isolation (foreign id → 404) | ✅ verified (guided-underwriting + M1 specs) |
| Authorization (unauth → login; read-only) | ✅ route under authenticated `(workspace)` layout (`requireUser`) |
| Desktop / tablet / mobile · keyboard · headings · landmarks · responsive · no overflow | ✅ verified (guided-underwriting a11y + responsive specs) |
| **Full browser suite (all specs together)** | ❌ **2 failures** — see Release Blocker |

## Product acceptance criteria

1. **Executive Structurability Summary first** — ✅ Proven. Leads with structurability + primary constraint +
   persisted engine recommendation + input-completeness; never opens with raw ratios (order asserted).
2. **Missing Information & information quality** — ✅ Proven. Four distinct states (Missing / Incomplete /
   Conflicting / Unavailable); provenance (source / field / as-of) from persisted authority only; absent
   provenance explicit, never inferred.
3. **Recommendation evidence** — ✅ Proven. Persisted recommendation + findings in persisted order; no
   reprioritization or reinterpretation.
4. **Decision history** — ✅ Proven. Chronological; actor/timestamp/rationale/engine-suggested-at-time shown;
   Agreement / Override / Awaiting-decision derived only from persisted records; no correctness judgement, no
   inferred intent.
5. **Workflow continuity** — ✅ Proven. Opportunity → Guided Underwriting → Advanced Analysis; honest
   unavailable state when underwriting is absent; no dead link; no fabricated readiness.
6. **Analyzer authority** — ✅ Proven. `/analyzer/[opportunityId]` remains authoritative for editing,
   comparison, and decision/approval workflows; Guided Underwriting is read-only.
7. **Architectural boundaries** — ✅ Proven. Integrated milestone introduced no schema/API authority, no
   underwriting calculations, no recommendation/decision synthesis, no decision writes/approval actions, no
   workflow engine, no analyzer replacement, no top-level navigation change (per-increment preflights).

## Standing contracts

- **Executive Summary (Answer → Evidence → Analysis)** — ✅ preserved (answer first).
- **Information Quality** — ✅ preserved (communicates trustworthiness, not just existence).
- **Decision Chronology** — ✅ preserved (historical sequence intact, never reprioritized).
- **Workspace Progression** — ✅ preserved (one question → next operational step; Opportunity → Guided → Analyzer).

## Findings

### Release Blocker — RB-1: Increment-4 browser test pollutes the shared seeded org (full regression not green)
- **Symptom:** the full browser suite fails 2 specs — `transaction-dashboard.spec.ts:24` ("lists every
  in-flight transaction…") and `opportunity-list-badges.spec.ts:38` ("…shows 'Closing not started'"). Both
  assert the seeded `empty` opportunity is pristine ("Closing/Checklist not started", no Escrow chips).
- **Root cause:** the Increment-4 "honest entry" test navigates to `/opportunity-workspace/${empty}`. That
  page **mutates on GET** — `getClosingGateStatus` → `ensureClosingChecklist` (lib/closing-service.ts) creates
  a closing checklist, and `ensureOpportunityDiligence` seeds diligence — so `empty` is no longer pristine for
  the later closing/transaction specs that share the single seeded org.
- **Evidence (deterministic):** full suite → 2 fail (parallel **and** serial); the two specs **in isolation** →
  24/24 pass; full suite **excluding** Guided Underwriting specs → **81/81 pass**. ⇒ the Increment-4 spec is
  the polluter.
- **Nature:** this is a **test-isolation defect**, not a product defect. The Milestone-2 product is correct;
  the Guided Underwriting suite, Milestone 1, and navigation all pass. The mutate-on-GET behavior of the
  Opportunity Workspace is pre-existing Milestone-1 behavior; Increment 4 merely triggered it on a fixture the
  closing/transaction specs assume is untouched.
- **Why it is nonetheless blocking:** the milestone cannot be certified with a green full regression — an
  explicit acceptance criterion — and the pollution would recur every full run.
- **Proposed remediation (a SEPARATE governed change — NOT performed during this review):** make the Inc-4
  honest-unavailable assertion non-polluting — e.g. use a dedicated fixture opportunity for the "no
  underwriting" check, or assert the unavailable entry without visiting the `empty` Opportunity Workspace.
  (Optionally, separately, evaluate the pre-existing mutate-on-GET pattern.) Then re-run the full regression
  and re-convene this milestone acceptance review.

## Plain statements

- **Does Milestone 2 satisfy its product objective?** Yes — the complete operator underwriting journey is
  delivered and all seven product criteria are Proven.
- **Are all four standing contracts preserved?** Yes.
- **Is Guided Underwriting feature-complete?** Yes (Increments 1–4 accepted).
- **Is it release-ready?** **No** — blocked by RB-1 (full regression not green).
- **Any blocker remaining?** Yes — one, RB-1 (test-isolation; product is not implicated).
- **Did underwriting authority change?** No.

## Recommendation

**REJECT** — a material regression-suite defect (RB-1) remains: the full Milestone 2 regression does not pass
green. The blocker is a **test-isolation defect introduced in Increment 4**, not a product/security/
authorization/accessibility/architectural defect; the product itself meets its objective and is feature-complete.
Per the review contract the defect is **documented and the review stopped, not repaired here**. Recommended next
step: authorize a small scoped remediation of the Increment-4 test, re-run the full regression, and re-convene
the milestone acceptance review. No Release Candidate, deployment, or final acceptance record is written.
