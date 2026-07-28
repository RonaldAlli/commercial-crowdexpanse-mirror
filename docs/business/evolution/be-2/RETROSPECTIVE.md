# BE-2 Step 1 — Retrospective

> Every Business Evolution step closes on three questions. Alignment — not output — is the metric.

## 1. What became more aligned?
- **Deal is now a real object** in the schema (Invariant 4 partially represented) with a deterministic,
  org-scoped, idempotent, **event-anchored** creation path — a Deal cannot exist without the canonical
  "Deal Controlled" fact. This is the architecture *constraining* engineering, exactly as intended.
- The **event-derived** posture was honored: control is read from the fact ledger, never from the mutable
  stage; a retracted control fact yields no Deal.
- The **Deal↔Transaction boundary** was settled (D-2) before any code could blur it.

## 2. What remained intentionally unchanged?
- The entire legacy path: `Opportunity`, `OpportunityStage`, escrow/financing/assignment/closing, buyer
  matching, all routes/screens/reports. **Zero production behavior changed** (Preservation Principle).
- No backfill — no history manufactured. No re-parenting — execution records stay on Opportunity until BE-5.
- Production data and deployment untouched; the migration is validated on `_test` only.

## 3. What new understanding was gained?
- **The control fact is not emitted in production** (the pipeline write path is dormant). So a Deal object
  keyed on the canonical event is correct but **inert** until a governed emission decision (O-2). This
  cleanly separated *Architecture → Alignment → Activation*: Step 1 is Alignment; Activation is later.
- The fact ledger is **not idempotent by construction**; exactly-once had to be enforced at the Deal layer
  (`opportunityId @unique` + P2002). Good to know for every future fact-derived aggregate.
- Building on the **production host** surfaced a real constraint: `.env` is the prod DB and `.next` is the
  live release — so all validation must be isolated (`_test`, `build:isolated`), and the prod migration is
  a deliberate, separate, backup-gated step.

## Follow-on work
- **O-2 (highest leverage):** decide how `CONTRACT_EXECUTED` is emitted in prod → Step 1 produces live Deals.
- **Step 2:** read-side compatibility projection + shadow report (Deal vs projected `UNDER_CONTRACT`).
- **BE-5:** Transaction first-class, taking ownership of the execution records (per D-2).
- **Prod application:** backup → `prisma migrate deploy` → deploy via D25, on explicit authorization.
