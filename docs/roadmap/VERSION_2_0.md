# Version 2.0 — Automation & AI

> **Theme:** Layer automation and AI on top of trusted, deterministic workflows.
> **Status:** 🔴 Planned. **Hard prerequisite: the end-to-end deterministic workflow (1.1–1.4) exists and is trusted.**

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
