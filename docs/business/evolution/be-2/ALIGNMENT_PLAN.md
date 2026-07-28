# BE-2 — Deal Becomes First-Class
## Business Alignment Plan (Business Alignment Phase 1)

> **Status:** PLAN for founder approval (2026-07-27). This is a **Business Alignment** effort, not a
> feature build. It aligns the implementation to the frozen Business Architecture v1.0 by
> introducing the **Deal** as a first-class domain object. No schema changes until this plan is
> approved.

## Objective

Introduce **Deal** as a first-class object so the platform faithfully represents the Domain Model:
*a Deal is an Opportunity over which we have obtained legal control; it is where the business is
paid.* Because Deal sits at the center of the architecture, aligning it lifts **Domain · Language ·
Events · Lifecycles · Workflows · Transaction · Closing · Reporting** together.

## The governing constraint — Preservation (additive before replacement)

Per the Constitution's **Preservation Principle** and your BE-2 rule: **do not remove the old model
until the new model proves itself.**

```
   Old Opportunity Model
           │
    Compatibility Layer   ← keeps old and new in sync; nothing breaks
           │
           ▼
    New Deal Aggregate
```

The compatibility layer is dismantled **only when** reports agree, workflows agree, events agree,
and the dashboard agrees — never before.

## Additive steps (each a governed change: gated + prod-verified + org-scoped)

1. **Introduce the Deal aggregate (additive migration).** New `Deal` model with a unique
   `opportunityId` (one Deal per Opportunity), org-scoped (Authority Rule 1). **No existing table is
   altered.** A Deal is created from the **`Deal Controlled`** event (event-derived), never hand-set.
2. **Compatibility layer + historical backfill.** Where an Opportunity is at/after `UNDER_CONTRACT`,
   a corresponding Deal exists; backfill Deals for historical under-contract Opportunities
   (**additive — preserves all history**). Existing Opportunity reads keep working unchanged.
3. **Re-parent execution records — to TRANSACTION, not Deal** *(corrected per the ratified
   Deal↔Transaction boundary — see `DECISIONS.md` D-2)*. Escrow, financing, assignment, closing,
   settlement, and revenue realization belong to **Transaction (BE-5)**, which is created *from* a
   Deal. Deal itself owns legal control (contract · negotiation history · purchase terms ·
   amendments · control instrument) and takes **no** execution-record children. This step therefore
   moves to **BE-5**; BE-2 does not re-parent any execution record.
4. **Align reporting.** Point BI (`dealCount`, revenue) at Deal/Transaction facts; **validate the
   numbers match the old computation before switching the display source.** *(reports agree)*
5. **Align workflows/UI.** Add a **Deal Workspace** (additive nav) serving the Deal lifecycle and the
   Negotiation/Closing workflows; existing Opportunity and Closing screens keep functioning.
   *(workflows agree)*
6. **Align events.** Confirm `Deal Controlled`, `Contingency Cleared`, `Deal Terminated` are canonical
   events driving the Deal lifecycle (Document 4). *(events agree)*
7. **Retire the compatibility layer — last.** Only once the dashboard shows reports + workflows +
   events + dashboards agree do we begin demoting the `OpportunityStage` control/close values and
   removing the dual-parent scaffolding.

## Acceptance (measured on the Business Alignment Dashboard)

- The **Deal** row rises from its 10% baseline at each step and reaches target when: Deal is
  first-class, execution records are re-parented, and reports/events/workflows agree.
- **Zero data loss** and **no regression** to the live deal workflow at any step (Preservation).
- Related rows (Domain, Transaction, Language, Workflows) improve as a side effect.

## Guardrails

- **Authority Rule 1** — Deal is org-scoped; scope derives from the session, never client input.
- **Additive migrations only** — no destructive change until retirement (step 7), and only after agreement.
- **Post-launch discipline** — feature branch (`align/be-2-deal`), per-step gate (typecheck + unit +
  build) + prod-verify via the D25 engine, release notes; no direct-to-main.
- **Business-First** — the deal workflow remains fully operable by staff throughout; no step makes AI
  or automation a dependency.

## Proposed first move (needs approval)

**Step 1 only:** introduce the additive `Deal` model + migration (no UI, no re-parenting yet), behind
the compatibility layer, with the historical backfill in step 2. Everything else waits until step 1
is verified and its dashboard impact is confirmed.
