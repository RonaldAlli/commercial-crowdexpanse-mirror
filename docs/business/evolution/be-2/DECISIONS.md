# BE-2 — Governed Business Decisions

> These are **business decisions**, ratified by the founder, that shaped BE-2. They are recorded here
> so they can be referenced without rereading the retrospective. They constrain implementation; they
> are not engineering choices.

**D-1 — The canonical control event is `CONTRACT_EXECUTED`.** The architectural business event
*"Deal Controlled"* is implemented today by the existing `CONTRACT_EXECUTED` decision fact
(`BUSINESS_SEMANTICS_SPECIFICATION.md` §2.4). **No duplicate event is created.** Any eventual rename
of the implementation term is BE-3's (Language) decision, not BE-2's.

**D-2 — The Deal↔Transaction ownership boundary (frozen).**
- **Deal owns:** legal control · contracts · negotiation history · purchase terms · amendments · control instruments.
- **Transaction owns:** escrow · financing · assignment · closing · settlement · revenue realization.

No future implementation may blur this boundary. Consequence: the original BE-2 plan's step 3
("re-parent execution records to Deal") is **superseded** — those records re-parent to **Transaction
(BE-5)**, which is created *from* a Deal. BE-2 re-parents nothing.

**D-3 — One Deal per Opportunity (v1.0).** Enforced by `deals.opportunityId @unique`. Re-contracting
the same Opportunity after termination (and amendments/replacement structures) is an **open governed
question deferred to a Business Evolution discussion (v1.1)** — it does not occur today.

**D-4 — No backfill.** History is never manufactured; a Deal originates only from a canonical control
event. Historical "under contract" Opportunities are **not** converted into Deals in Step 1.

**D-5 — Compatibility layer mandatory; no replacement before proof.** The migration is additive only;
the legacy `Opportunity`/`OpportunityStage` path is untouched. Nothing is removed until reports,
workflows, events, and the dashboard agree (Preservation Principle).

**Supporting record decisions.** The `Deal` model reserves `businessArchitectureVersion` (audit of
which baseline a Deal was created under). This folder and the `INDEX.md` are the permanent historical
record for BE-2, per the governance habit.
