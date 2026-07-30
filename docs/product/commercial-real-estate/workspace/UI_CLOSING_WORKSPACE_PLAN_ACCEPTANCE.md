# CRE Operating Workspace — Closing Workspace — Planning Acceptance Record

> **Status: PLANNING ACCEPTED** (founder-accepted 2026-07-30). Accepts the Closing Workspace planning package
> `UI_CLOSING_WORKSPACE_PLAN.md` (PR #70) evaluated against `main d3caf4f`. Recommendation **READY TO IMPLEMENT**
> accepted (verified backend authority, not assumptions). This is the authoritative planning decision.
> Context: `UI_CLOSING_WORKSPACE_PLAN.md`, `UI_MILESTONE_2_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## Accepted conclusions

- **Backend authority is sufficient** — the closing domain already answers whether the transaction is ready to
  close, what is blocking, who owns the blocker, and the next milestone. This is an **operator façade over
  existing authority**, not a backend initiative.
- **Workspace boundaries** confirmed: Opportunity (*pursue*) → Guided Underwriting (*structure*) → Closing
  Workspace (*close*) → Closing Console (*execute*). The workspace is a presentation layer; the console
  (`/opportunities/[id]`) executes closing work.
- **Candidate read-first structure** confirmed: Executive Closing Summary → Blockers → Owners / Next Milestone
  → Timeline → deep-link to the Closing Console.
- **Risks** accepted, with emphasis on:
  - **R1 (console duplication)** — the workspace must remain presentation; it must **never** absorb execution
    workflows from the Console.
  - **R4 (readiness semantics)** — "checklist complete" ≠ "transaction actually closeable"; if escrow,
    financing, or assignment remain unresolved, the workspace must communicate that explicitly rather than
    implying readiness.

## Added planning constraint (new)

**Domain Progression.** Closing is domain-based. Operators must immediately understand the state of
**Checklist · Escrow · Financing · Assignment**. These domains must remain **visually separate** — not
collapsed into a single "blocked" list — wherever the underlying authority supports the distinction. This
complements the Information-Quality contract by making *where* the risk sits immediately visible.

## Standing contracts (all honored)

Executive Summary (answer first) · Information Quality (+ Domain Progression) · Decision Chronology · Workspace
Progression.

## Next governed step — Increment 1 (defined; awaits its own authorization)

**Closing Workspace — Increment 1: Executive Closing Summary**, bounded around the single operator question
**"Can this transaction close?"**. Reuse ONLY existing read authority; present:
- closing **readiness** and **readiness summary** (`closingReadinessSummary` — checklist gate);
- **primary blockers**;
- **domain readiness** — Checklist, Escrow, Financing, Assignment, each shown **distinctly** (Domain
  Progression; R4);
- a prominent **deep-link to the Closing Console** (`/opportunities/[id]`).

**Boundaries:** no write actions · no workflow changes · no console duplication (R1) · never imply closeable
when a domain is unresolved (R4).

**No implementation is authorized by this planning acceptance.** Increment 1 receives its **own explicit
APPROVED TO IMPLEMENT** decision before development begins. Subsequent increments (owners/next-milestone detail,
timeline, Opportunity-Workspace integration + a11y + discoverability) are each separately authorized.
