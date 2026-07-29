# CRE Operating Workspace — UI Milestone 1, Increment 5 Implementation Report

> **Scope: Next Best Action + Missing Information synthesis** — the first genuinely-new-logic layer.
> A deterministic, pure synthesis engine over ONLY existing governed facts, rendered through the accepted
> Increment-1 Evidence Chain / Missing-Information primitives and wired additively into the Seller Record
> and Opportunity Workspace pages. No schema, API, domain-model, tenant-authority, stage-policy,
> promotion-rule, comms-gate, or BE-3 change; the accepted Increment-1 primitives and the Increment-2/3
> view components are byte-unchanged. Branch `feat/cre-ui-m1-increment-5` off verified main `d7d1ceb`.
> Context: `UI_MILESTONE_1_PLAN.md`, `UI_M1_INCREMENT4_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## What was built

| File | Change | Role |
|---|---|---|
| `lib/workspace-ui/synthesis.ts` | **new** | pure deterministic synthesis engine (seller + opportunity) |
| `components/workspace-ui/synthesis/SynthesisPanel.tsx` | **new** | renders synthesis via the Increment-1 primitives |
| `app/(workspace)/seller-queue/[id]/page.tsx` | **modified (additive)** | wires the panel above the seller record |
| `app/(workspace)/opportunity-workspace/[id]/page.tsx` | **modified (additive)** | wires the panel above the workspace |
| `tests/unit/workspace-ui/synthesis.test.ts` | **new** | pure-logic tests (all required cases) |
| `tests/unit/workspace-ui/synthesis-inc5.contract.test.ts` | **new** | structural boundary tests |

The two page edits are **additive wiring only** — they compute the synthesis from facts they *already
load* and render the panel; the accepted `SellerRecordView` / `OpportunityWorkspace` view components and
all Increment-1 primitives are **byte-unchanged**. Full `workspace-ui` suite **107/107 green** (prior
increments included); Increment-5 files `tsc`-clean.

## The engine

Deterministic, pure, no clock/random (any `now` is injected), no data access, no mutation. It consumes
only existing facts: the qualification checklist + progress, `nextFollowUpAt`, promotion eligibility
(`resolveSellerPromotion` result), `evaluateStageMove` (`suggestedAction`/`missingTruth`/
`missingArtifacts`), `summarizeDiligence`, and the closing gate. It produces, for both seller and
opportunity, a **Next Best Action** (with its Evidence Chain, categorical confidence, evidence used,
evidence missing, and *why competing candidates were not selected*) and a **four-state Missing
Information** list (each with why / source / resolution).

Documented deterministic precedence: seller = `opt-out → promotion → complete-qualification →
follow-up`; opportunity = `advance → advance-with-attestation → resolve-stage-block → complete-diligence
→ clear-closing-blockers`. When candidates cannot be honestly distinguished, or existing facts conflict,
the result is **Review Required** — no invented tie-break.

## Findings — classified

### Proven
- **Deterministic synthesis only** — identical facts → identical output; no clock/random; reproducible.
- **Categorical confidence** (`High / Medium / Low / Review Required / Not Yet Scored`) — never numeric or
  probabilistic; each category explainable solely from available evidence.
- **Every recommendation carries its Evidence Chain** (recommendation → supporting → missing → confidence
  → next action) and its rejected alternatives; a recommendation never appears without evidence.
- **Four Missing-Information states preserved and distinct** (Missing / Incomplete / Conflicting /
  Unavailable), each with why / source / resolution.
- **Conflicting evidence → Review Required** (e.g., outreach status `QUALIFIED` while the qualification
  checklist is incomplete) — surfaced, not masked.
- **Insufficient evidence → Not Yet Scored** with a null recommendation and empty supporting evidence.
- **Reacts to evidence** — the recommendation changes when facts change and disappears when its
  supporting evidence disappears.
- **Advisory only** — the engine calls no governed workflow and mutates nothing; stage policy, promotion
  rules, comms gates, and authority continue to decide.

### Existing Backend Constraint
- The synthesis is bounded by the facts the pages already load; it adds **no new query or service**.
- Some Missing-Information items are structurally **Unavailable** because the backend does not model them
  (e.g., motivation scoring) — reported as Unavailable, never fabricated.

### Ambiguous by Design
- When candidate actions are indistinguishable or existing facts conflict, the engine yields **Review
  Required** and routes the Evidence Chain's next action to a neutral review state rather than choosing.
- Indistinguishable inputs remain ambiguous by design (consistent with the civ-2 identity philosophy):
  the engine surfaces uncertainty instead of inventing certainty.

### Deferred
- Browser-level accessibility/responsive verification → Increment 6.
- Any future numeric/model-based confidence would be a separate governed decision (explicitly out of
  scope; confidence is categorical here).

## Accessibility (source-level)

The panel renders through the accessible Increment-1 primitives: the Evidence Chain is a labelled group;
confidence is a text chip with an `sr-only` clarification ("categorical — never a numeric score");
Missing-Information items carry visible why / source / resolution text and an icon-plus-text badge (not
color alone); the "why not the alternatives" list is plain text. Browser-level verification remains
Increment 6.

## Boundaries honored

No AI scoring · no numeric/probabilistic confidence · no motivation/priority score · no inferred facts ·
no seller/opportunity ordering change · no stage-policy change · no promotion-rule change · no comms-gate
change · no APIs · no schema · no new persistent model · no recommendation history · no clock dependence ·
no change to accepted Increment-1 primitives · no BE-3 change.

## Note on the two page edits

Wiring the synthesis panel required additive edits to the two owning pages (Seller Record, Opportunity
Workspace). This is the first increment to modify previously-accepted files. The edits are **strictly
additive** (compute-from-existing-facts + render a panel), the accepted **view components remain
byte-unchanged**, and **all prior increment tests remain green (107/107)** — the Increment-2/3 contract
tests, which pin the view components and forbid direct Missing-Info primitive use in those files, still
pass.

## Stop

Opened for the **UI Milestone 1 Increment 5 Review**. Not to be merged, accepted, tagged, deployed, or
followed by Increment 6 without separate governed authorization.
