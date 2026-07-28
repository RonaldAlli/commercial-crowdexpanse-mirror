# Business Evolution — Index

> The historical roadmap of how the platform converges toward the frozen Business Architecture
> (v1.0) **without replacing it.** Each initiative has its own permanent folder (`be-<n>/`); together
> they accumulate into the future Business Architecture Decision Log. Alignment — not output — is the
> success metric.

| Initiative | Status | Alignment gain | Governed decision(s) | Completed |
|---|---|---|---|---|
| **BE-1** — Market first-class | Planned | Market 0% → — | — | — |
| **BE-2** — Deal first-class | **Step 1 deployed & accepted (M3)** — additive aggregate, inert | Deal 10% → ~25% | CONTRACT_EXECUTED = "Deal Controlled"; Deal↔Transaction boundary; 1 Deal/Opportunity; no backfill; compatibility mandatory | Step 1 — 2026-07-28 (see `RELEASE_HISTORY.md`) |
| **BE-3** — Language enforced | **Planning (branch in review)** — 7 planning docs; scope = 6 ratified "Retire via BE-3" mappings (Doc 3 §3); no implementation | Language 65% → — | (planning) enforce ratified §2 vocabulary; observability-first (Detect→Measure→Prevent→Reduce, frozen); no destructive rename before compatibility sign-off | — |
| **BE-4** — Events canonical + per-object lifecycles | Planned | Events 70% / Lifecycles 40% → — | — | — |
| **BE-5** — Transaction first-class | Planned | Transaction 25% → — | (owns escrow/financing/assignment/closing/settlement/revenue per BE-2 D-2) | — |

*Milestones:* **M1** — Business Architecture v1.0 Ratified (2026-07-27, merge `8b73426`). **M2** — First
Architecture-Guided Implementation = BE-2 Step 1 merged (PR #2, `ca76c0f`). **M3** — Production Acceptance
= BE-2 Step 1 deployed + verified + monitored (2026-07-28, release `r1137725878952438`). **M3.5** — Governance
Operational Tooling (2026-07-28, PR #4 `7c1ad35`): the manual controls from BE-2 codified into reusable, fail-closed
operational tooling (verify-merge / guarded-migrate / post-deploy monitor) — an organizational milestone, distinct
from deployment; the standing "Governance Tooling" step now sits permanently between each BE-n and BE-(n+1). **M3.6** —
Evidence-Governed Implementation Proven (2026-07-28): BE-3 Phase 1 produced deterministic evidence (detector `BE3-DET`),
that evidence underwent formal acceptance (`BE3-EVIDENCE-BASELINE-v1.0` — ACCEPTED WITH OBSERVATIONS), and implementation
stopped at the review gate before any remediation — anchored by annotated tags `be3-detector-v1.0` (→ `d038957`) and
`be3-evidence-baseline-v1.0` (→ verified evidence merge `794c647`). M4/M5 pending.
