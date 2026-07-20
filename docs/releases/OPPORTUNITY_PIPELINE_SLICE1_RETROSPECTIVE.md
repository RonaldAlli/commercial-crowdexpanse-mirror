# Opportunity Pipeline Slice 1 — Release Retrospective

> Concise engineering record (2026-07-20). Companion to the
> [Acceptance record](./OPPORTUNITY_PIPELINE_SLICE1_ACCEPTANCE.md).

## What went well
- **Architecture-first.** The Stage Policy Evaluation layer (pure rule engine → reusable service →
  workflow) kept policy, workflow, and persistence separate and composed with — never replaced — the
  existing role and PAID gates. The rich evaluation result and typed attestation builder are reusable
  by future callers (imports, automation, API, audit) and future rules.
- **Staged, evidence-based rollout.** Discovery → root-cause-before-code → fix → measure → regression →
  merge → deploy → observe, with a live-server evidence trail rather than assumptions at each gate.
- **Deterministic, not "AI," personalization of the pipeline** — stages became projections over
  authoritative truth (semantic contract), strengthening determinism.

## What escaped testing (and reached production)
1. **Unbounded board (PB-1).** The board loaded and rendered *every* opportunity (9,641), each mounting
   an interactive dropdown — an O(N) payload/hydration cost. Not caught because tests ran on small
   fixtures; the cost only manifested at production data volume.
2. **Stage-submission race (PB-2).** The rebuilt control submitted via
   `requestAnimationFrame(requestSubmit)` over controlled inputs — a timing race that could submit a
   stale stage (silent no-op). Not caught because there was no *browser* regression for the stage move.

## How they were detected
- The Founder's **production browser re-drive** — the first time the feature ran against production
  volume in a real browser.

## How they were fixed
- **PB-1:** bounded board — per-stage counts (`groupBy`) + one bounded scan (derived
  `BOARD_PER_COLUMN × stages × buffer`) grouped in memory, ≤25 cards/column, "View all → List".
  Measured: 582 ms / 9,641 cards → 62 ms / ≤325 cards.
- **PB-2:** deterministic submission — build `FormData` explicitly and call the server action directly;
  removed the RAF/DOM dependency.
- **Regression:** Playwright specs now cover the stage move (card moves columns + DB persists) and the
  attestation cancel/confirm paths, plus a bounded-board assertion.

## What changed in the release process
- **Add browser-driven acceptance tests to the pre-deploy gate.** Both escapes were browser/volume
  behaviors invisible to unit/integration tests; Playwright specs against seeded data now guard them.
- **Prefer production-like data volume** in performance-sensitive UI tests.
- **Live-server evidence over memory** for every release-state claim (build ID, PM2, logs, DB, git).
- **Deployment mechanics** — the in-place `.next` rebuild produced a transient deploy-window error
  burst; move to build-elsewhere + atomic swap (tracked in [Technical Debt](../roadmap/TECHNICAL_DEBT.md)).

## Deferred / separate
- Memory-recycle investigation (pre-existing 512 MB pm2 ceiling hit routinely) — separate operational
  debt, not a Slice-1 defect. Automation remains paused (D19). Later pipeline slices (UNDERWRITING →
  BUYER_MATCHED → OFFER_READY/LOI_SENT → PAID-policy) follow the same architecture.
