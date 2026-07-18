# Version 2.0 — Automation & AI

> **Theme:** Layer automation and AI on top of trusted, deterministic workflows.
> **Status:** 🔴 Planned. **Hard prerequisite: the end-to-end deterministic workflow (1.1–1.4) exists and is trusted.**
> **Architecture:** FOUNDER RATIFIED 2026-07-16 — see the [Automation Architecture Lock](../architecture/AUTOMATION_ARCHITECTURE_LOCK.md) (invariants AU-1…AU-13), the [Decision Package](../architecture/VERSION_2_0_DECISION_PACKAGE.md), and the [Discovery Report](../architecture/VERSION_2_0_DISCOVERY.md). Ratification governs the design only; each phase is separately approved before implementation.

## Phased delivery (deterministic-first)

Automation is a first-class bounded domain built slice by slice. The spine comes first, before any capability depends on it.

| Phase | Title | Status |
|---|---|---|
| **2.0.1** | **Automation Foundation, Job Execution & Audit** (the spine: org-scoped job execution, Automation Principal, immutable execution ledger, idempotency, retry/dead-letter, mandatory policy, crash recovery — proven by one harmless internal read-only proof job) | 🟢 **FOUNDER APPROVED FOR IMPLEMENTATION (2026-07-16 · Ronald Delroy Anthony Allicock).** Building on `feature/v2.0.1-automation-foundation`; production merge/deploy remain gated on separate acceptance. See the [Implementation Plan](../architecture/VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md), [Schema Proposal](../architecture/VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md), [Acceptance Criteria](../architecture/VERSION_2_0_PHASE_2_0_1_ACCEPTANCE_CRITERIA.md), [Test Plan](../architecture/VERSION_2_0_PHASE_2_0_1_TEST_PLAN.md), [Rollout Plan](../architecture/VERSION_2_0_PHASE_2_0_1_ROLLOUT_PLAN.md), and [ADRs](../architecture/adr/). |
| 2.0.2+ | Event-driven triggering (transactional outbox), then reminders, communications, conversation intelligence, and AI assistance — each on the ratified spine, each separately ratified | 🔴 Planned |

> **Status update 2026-07-18 (see the [Canonical Platform Roadmap](./CANONICAL_PLATFORM_ROADMAP.md) for authoritative current state):** Phase 2.0.1 was subsequently **Founder-accepted, FF-merged to `main`, and migration 27 was applied to production** — but the automation **executor was never started** (paused at dark-start; **D19** open). Separately, an off-roadmap **CRM layer** (migrations 28–30) was reconciled and Founder-accepted. **Production is now at 30 migrations**, not 26. This section's original wording ("prod stays at 26", "not merged") described the state *at implementation acceptance* and is retained below for history only.
>
> *(historical, at 2.0.1 implementation acceptance)* Phase 2.0.1 is **approved and under implementation on a feature branch**. No 2.0.1 code has merged to `main`, no migration has been applied to production (prod stays at 26), and the automation process is not running in production — those steps remain gated on separate Founder acceptance.

## Guiding rule
> AI comes **only after workflows exist.** We do not automate or "intelligently assist" a process we haven't first proven by hand. Every AI capability is governed by [Volume 6 — AI Roadmap](./AI_ROADMAP.md).

## Goal
Close the loop from lead sourcing to closing with automation, and augment (never replace) the team's judgment with AI over data and workflows that already work.

## Scope

### 1. Marketing
Seller-sourcing campaigns tied to the seller-source tiers; landing/intake that creates org-scoped `Seller` leads with source attribution (feeds closings-per-source).

### 2. Campaigns
Multi-step outreach sequences to sellers and buyers; templates; scheduling; attribution back to pipeline outcomes.

### 3. Communication
In-app + outbound communication (email/SMS where permitted) logged against sellers/buyers/opportunities; every message auditable and org-scoped.

### 4. Conversation Intelligence
Structured capture of seller/buyer conversations: summaries, extracted terms, motivation signals, next-step suggestions — with the human always confirming what's saved.

### 5. AI Assistance
Assistants over existing modules: underwriting narrative drafts, buyer-match explanations, document extraction (T12/rent-roll parsing), pipeline nudges. Each documented per [Volume 6](./AI_ROADMAP.md) (purpose/inputs/outputs/rules/failure/override/testing).

## Architecture notes (AI boundaries — binding)
- **Human-in-the-loop for writes:** AI proposes; a human confirms before any DB write.
- **Deterministic fallback:** every AI feature degrades to the manual workflow it augments.
- **Org-scoped, provider-bounded:** AI only sees one org's data; provider/model choices centralized; no cross-tenant leakage.
- **Auditable:** AI actions/suggestions are logged like any other activity.
- **Model choice:** default to the latest, most capable Claude models; centralize in one client module.

## Dependencies
- 1.1 (permissions/audit), 1.2 (intelligence data), 1.3 (underwriting), 1.4 (closing) — all required.

## Definition of Done (2.0)
Global DoD **plus**: every AI capability has a Volume 6 spec, a human override, a deterministic fallback, and tests for its failure modes.

## Out of scope
Fully autonomous actions without human confirmation — explicitly disallowed.
