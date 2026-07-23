# Opportunity Pipeline Migration Initiative

> **Status: BACKLOG — not started. Design-first. No code.**
> This is a framing note, not a design. It records *why* the initiative exists, the *one question* it
> opens with, and the reason it is deliberately separate from the Seller Acquisition feature that ships
> on today's production seams. Created 2026-07-23.

---

## Why this initiative exists (the discovered fact)

While scoping the Seller Acquisition Vertical ("Promote Qualified Seller → Active Opportunity"), a
read-only investigation established a fact neither the founder nor the builder knew beforehand:

**The production application already contains a complete, functioning
`Opportunity → Stage → Buyer Match` workflow that is entirely independent of the Slice 2 pipeline.**

- Seller qualification exists — `Seller.outreachStatus == QUALIFIED` (`ContactOutreachStatus`).
- Opportunity creation exists — `createOpportunity` (`app/(workspace)/opportunities/actions.ts`).
- Stage advancement exists — `Opportunity.stage` (mutable enum) advanced through the pure policy engine
  `lib/stage-policy.ts` + `lib/stage-policy-service.ts` (`applyStageTransition`).
- Buyer matching exists — `generateMatches` (`app/(workspace)/matches/actions.ts`) over the deterministic
  scorer `lib/matching.ts`.
- **Coupling to the Slice 2 pipeline: zero.** Nothing in `app/` or `lib/` (outside `lib/pipeline-*`)
  references the pipeline; the Slice 2 modules do not reference the legacy stage system. The two are
  disjoint by design — the pipeline was built *alongside* the legacy workflow, not *through* it.

That fact changes what "route the promote flow through the pipeline" means. It is not a feature. It is a
**migration** from the legacy stage model to the Slice 2 projection — and migrations carry compatibility,
synchronization, source-of-truth, rollout, cutover, and deprecation questions. That belongs in its own
deliberate, design-first effort, not smuggled in behind one button.

## This is NOT technical debt

The legacy `Opportunity → Stage → Buyer Match` workflow is **the current production workflow**, not debt.
The Slice 2 pipeline was intentionally built *beside* it (see the Slice 2 Architecture Baseline). Shipping
customer value on the existing seams is therefore the shortest correct route to revenue — not a shortcut
that incurs a liability. When the migration is eventually done, it will be decided from a position of
strength: real users, real opportunities, real buyer matches, and real operational feedback to inform it.

## The one question this initiative opens with

> **Should the Slice 2 Projection become the canonical source of truth for an opportunity's stage?**

Notice what kind of question this is. It is **not** "how do we wire the button." It is a **business-truth**
question — which model *is* the authority for where a deal stands. Per the Engineering Constitution
(Law 3/10), a new business concept returns to the Decision process. This is that concept.

Everything else in the initiative is downstream of the answer:

- **Compatibility** — can both systems coexist during transition, and for how long?
- **Synchronization** — if both are live, who writes to whom, and how is divergence detected/reconciled?
- **Source-of-truth** — projection-authoritative, legacy-authoritative, or dual-write with one canonical?
- **Rollout** — per-org, per-opportunity, or global? Shadow-mode first?
- **Cutover** — the moment legacy `Opportunity.stage` stops being written.
- **Deprecation** — retiring `applyStageTransition` / the legacy stage enum once the projection is canonical.

## Preconditions (why not now)

1. The Seller Acquisition feature ships first on the existing seams (revenue sooner).
2. There is real operational data and feedback to decide from — see "position of strength" above.
3. This initiative is picked up **deliberately**, entering the design-first process at Phase 1 (Decide),
   opening with the one question above — exactly as Opportunity Pipeline Slice 2 did.

## References

- `docs/architecture/Slice2_Architecture_Baseline_v1.0.md` — what the pipeline is, and that it was built
  alongside the legacy workflow.
- `docs/releases/OPPORTUNITY_PIPELINE_SLICE2_DECISION_LOG.md` — OWN-4 stage spine (the projection model
  this initiative would make canonical).
- `docs/architecture/OPPORTUNITY_PIPELINE_ENGINEERING_CONSTITUTION.md` — Law 3/10 (new business concept →
  Decision process), the design-first discipline this initiative must follow.

---

*A business feature must not become an accidental architecture migration. This note exists so the
migration is chosen on purpose, when the evidence is strongest — not triggered by a button.*
