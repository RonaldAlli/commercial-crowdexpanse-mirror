# BE-2 — Deal Becomes First-Class

**Purpose.** Make **Deal** a first-class domain object so the platform faithfully represents the
Business Domain Model: *a Deal is an Opportunity over which we have obtained contractual/legal
control — where the business holds enforceable rights and obligations, and is paid* (Invariant 4).

**Current status — Step 1 COMPLETE (2026-07-27), additive & inert.**
- The `Deal` aggregate and an org-scoped, idempotent `ensureDeal` service exist, anchored to the
  canonical "Deal Controlled" event (current implementation: the `CONTRACT_EXECUTED` decision fact).
- Nothing is wired to a live production path; no re-parenting; no backfill; the Opportunity path is
  untouched. The migration is authored and validated against `_test` but **not applied to
  production** (a separate, backup-gated operator step).
- Alignment: Deal **10% → ~25%** (structural existence; not yet load-bearing).

**This folder (permanent historical record):**
- `ALIGNMENT_PLAN.md` — the additive, compatibility-first plan (step 3 corrected to Transaction).
- `DECISIONS.md` — the governed business rulings that shaped BE-2.
- `ASSUMPTIONS_REGISTER.md` — assumptions, split resolved vs open.
- `READINESS_REVIEW.md` — the pre-implementation readiness verdict.
- `IMPLEMENTATION_LOG.md` — factual implementation milestones.
- `ACCEPTANCE_REPORT.md` — what shipped + validation evidence.
- `DASHBOARD_DELTA.md` — the measured alignment movement.
- `RETROSPECTIVE.md` — the three closing questions + follow-on.

**Next:** Step 2 (proposed, not started) — a read-side compatibility projection + shadow report, and
the governed decision on how `CONTRACT_EXECUTED` is emitted in production (the pipeline write path is
currently dormant). Step ≥3 (execution re-parenting) belongs to **BE-5 (Transaction)** per D-2.
