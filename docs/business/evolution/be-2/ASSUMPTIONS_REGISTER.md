# BE-2 — Assumptions Register

> Every assumption made in Step 1, split into **resolved** (ratified) and **open** (governed
> questions that gate later work). This is the document people read months later to understand *why
> it was implemented this way.*

## Resolved (ratified — see DECISIONS.md)

| # | Assumption | Basis |
|---|---|---|
| A-1 | `CONTRACT_EXECUTED` **is** the implementation of "Deal Controlled" | D-1 |
| A-2 | Deal owns legal control; Transaction owns execution | D-2 |
| A-3 | Exactly one Deal per Opportunity (v1.0) — `opportunityId @unique` | D-3 |
| A-4 | No backfill; a Deal exists only from a canonical control event | D-4 |
| A-5 | Additive only; no re-parenting; Opportunity path untouched | D-5 |
| A-6 | A Deal is inert in production until a control-fact emission decision is made | Readiness Review |
| A-7 | Control = an **active, non-withdrawn** `CONTRACT_EXECUTED` DECISION (a RETRACT does not control) | implementation |

## Open (governed questions — gate later steps, NOT Step 1)

| # | Open question | Gates | Owner |
|---|---|---|---|
| O-1 | Re-contracting / amendments / replacement structures — more than one Deal per Opportunity over time? | v1.1 cardinality decision | Business |
| O-2 | **How is `CONTRACT_EXECUTED` emitted in production?** The pipeline write path is dormant (no HTTP route; automation executor off); today's live "control" signal is the mutable `OpportunityStage`. | Step 1 producing live Deals; BE-4 | Business + Eng |
| O-3 | Re-parenting mechanics of escrow/financing/assignment/closing/settlement/revenue onto Transaction | BE-5 | Eng under D-2 |
| O-4 | Legal-control instruments other than a signed contract (deed, option) — do they emit the same control event? | future | Business |
