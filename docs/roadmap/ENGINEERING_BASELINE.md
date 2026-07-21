# CrowdExpanse Commercial — Engineering Baseline

> **The standard process every production change follows.** Companion to the [Product
> Baseline](./PRODUCT_BASELINE.md) (what it does) and [Operations Baseline](./OPERATIONS_BASELINE.md)
> (how prod behaves). Codifies the workflow validated by the Opportunity Pipeline Slice 1 release.
> **As of 2026-07-20.**

## The release lifecycle
```
Requirements → Architecture (acceptance-first: criteria + design before code)
  → Implementation (isolated worktree; own node_modules + test DB)
  → Unit tests → Integration tests → Browser regression (Playwright) → Performance measurement
  → Full gate (tsc · unit · e2e · isolated build · frozen-ref/kernel check · secret scan · dep audit · ownership guard)
  → Merge (strict fast-forward, explicit authorization) → both remotes
  → Deploy (separate authorization: predeploy gate → restore-verified backup → web-only build+restart → smoke)
  → Observation (evidence-based window vs the Operations Baseline)
  → Acceptance (live server evidence, not memory) → Retrospective → Technical-Debt + Baseline updates
```

## Non-negotiable disciplines
1. **Acceptance-first.** Objective exit criteria (and, for behavior, the *existing* behavior documented) **before** code. Verify existing behavior; don't invent rules.
2. **Isolated worktrees.** Real (non-symlinked) `node_modules` + dedicated test DB; production checkout is **runtime only** — never a dev environment. No root-run builds/prisma/git (ownership guard).
3. **Frozen refs are immutable.** `v1.3.0` / `v1.4.0` / accepted slice tags never move; frozen modules stay byte-identical unless a **confirmed defect** requires a separately-reviewed forward fix (flagged explicitly).
4. **Separate authorizations.** Merge, deploy, and Automation are **distinct** explicit gates — never bundled, never assumed. Nothing outward-facing ships without it.
5. **Evidence from the server, not memory.** Every release-state claim (build ID, PM2, logs, DB, git) is read live at decision time.
6. **Evidence-based observation.** Compare against the Operations Baseline; judge restarts by *character* not *count*; distinguish deploy-mechanics artifacts from application regressions.
7. **Reversibility.** Every deploy retains a `.next` rollback snapshot + a restore-verified backup; prefer web-code rollback over schema rollback (migrations are additive).
8. **Decouple concerns.** Feature correctness, operational behavior, and deployment mechanics are tracked separately — a pre-existing operational trait never permanently blocks verified feature work, but is made visible as debt.
9. **Nothing silent.** Capped/bounded/skipped behavior is logged; anomalies are surfaced, not glossed.
10. **Fresh builds only — never migrate build artifacts.** Generated build output (`.next`/release dirs, and their `types/`) is **never moved, copied, or reused between releases**; every release is produced by a **fresh build from source**. (Moved artifacts carry stale internal paths — the D25b staging contamination: a relocated build's generated route-types kept deep `../` paths and broke the next build's type-check.)
11. **Verify against throwaway fixtures, never the production checkout.** When a check can run against a temp dir or the isolated staging instance, it must — the deploy engine is never pointed at the production checkout for verification. (From the D25b near-miss: a mis-parsed `--app-dir` ran a build inside prod; safety layers held, but the rule removes the hazard.)

## Deliverables per release
Acceptance record · retrospective (what went well / what escaped testing / how detected / how fixed /
process change) · technical-debt entries with triggers · frozen tag · updated Product/Operations
baselines where behavior changed.

## Lessons folded in (from Slice 1)
- **Browser-driven acceptance belongs in the pre-deploy gate** — the escapes (unbounded board, submission
  race) were volume/browser behaviors invisible to unit/integration tests.
- **Test at production-like data volume** for performance-sensitive UI.
- **Root-cause before code** on production incidents; reproduce + measure first.
