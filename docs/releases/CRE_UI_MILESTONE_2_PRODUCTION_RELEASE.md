# CRE Operating Workspace — UI Milestone 2 (Guided Underwriting) — PRODUCTION RELEASE RECORD

> **Status: RELEASED** — deployed to production and verified live 2026-07-30. Follows the full Accepted →
> Released lifecycle (as Milestone 1), each step completed and verified in order. Context:
> `UI_MILESTONE_2_ACCEPTANCE.md`, `UI_MILESTONE_2_ACCEPTANCE_REVIEW.md`, [[crowdexpanse-cre-workspace]].

## What was released

- **Baseline:** `main 3a1aad8` — UI Milestone 2 (Guided Underwriting), Increments 1–4 accepted, plus the RB-1
  test-isolation remediation and the final acceptance record.
- **New surface (read-only, auth-gated):** `/guided-underwriting/[opportunityId]` — Executive Structurability
  Summary → Missing Information → Why Recommended → Decision History → Supporting Metrics → Advanced Analysis;
  plus a **"Guided underwriting" cross-link** from the Opportunity Workspace.
- **No migration** — 0 `prisma/` and 0 `app/api/` changes across the entire M2 span (read-only over existing
  underwriting authority).

## Release sequence executed (governed, in order)

1. Merge RB-1 fix (PR #67) → `main 5e0453e`; verify-merge PASS.
2. Final acceptance record (PR #68, ACCEPT WITH OBSERVATIONS) → `main 3a1aad8`; verify-merge PASS.
3. **Release Candidate** — D25 `--dry-run`: build + swap/rollback-target + single-active + disk/retention
   validated; live server unchanged. Migration delta empty.
4. **Production deploy** — D25 atomic engine (`deploy.mjs --app-dir /opt/crowdexpanse/commercial --production
   --yes`): build → verify-build → SWAP → restart → verify-runtime → smoke → complete. Auto-rollback armed;
   not triggered. Live release `releases/r1314090187846708-3640443`, build `6G09m-cbw6BHNfYgGrSn2`.

## Production verification (all PASS)

- `/api/health` → 200 (~21ms); pm2 `crowdexpanse-commercial` online.
- Auth-gating: unauthenticated `/guided-underwriting/[id]` → **307 → /login** (not exposed).
- Authenticated (real ADMIN): `/guided-underwriting/[id]` → **200**, renders "Guided Underwriting" (prod has no
  underwriting scenarios yet → honest empty state, as designed).
- **Landing unchanged** — `GET /` → 307 → `/dashboard`.
- Regression: `/command-center`, `/seller-queue`, `/dashboard`, `/opportunities`, `/api/health` all 200.
- Production logs: current process wrote **zero** errors since cutover.

## Discoverability verification (Opportunity → Guided Underwriting → Advanced Analysis)

- The Opportunity Workspace serves the **"Guided underwriting" entry** in production (verified in the served
  HTML for a real opportunity).
- `/guided-underwriting/[id]` serves and deep-links onward to `/analyzer/[id]` (authoritative).
- No dead links; the complete operator journey is reachable in production.

## Standing

- **UI Milestone 2 = RELEASED + verified + discoverable.** No milestone tag (consistent with Milestone 1).
  Reference: release stamp `r1314090187846708-3640443` + baseline `3a1aad8`.
- Non-blocking observations OB-1 (Playwright teardown warning) and OB-2 (mutate-on-GET architectural question)
  remain tracked independently.
- **UI Milestone 2 is formally CLOSED** with this release. Future workspace work (Closing / Revenue / Buyer-
  Capital Matching / Deal Room) proceeds under new governed initiatives, honoring the four standing contracts
  (Executive Summary · Information Quality · Decision Chronology · Workspace Progression).
