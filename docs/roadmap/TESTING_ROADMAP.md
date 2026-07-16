# Volume 8 — Testing Roadmap

> Tests are part of the feature (EMP principle). This volume defines the test pyramid we're building toward. Current strength is the integration/E2E layer; the gaps are unit, regression, and non-functional testing.

## Current state (✅ foundation + unit layer)
- **15 E2E integration scripts** (`scripts/e2e-*.mjs`), one per major module, asserting behavior + **org isolation**.
- **Unit layer (PQ-1):** `node:test` + `tsx`, tests under `tests/unit/**` organized by module (`analysis/`, `matching/`, `permissions/`, `list-params/`, `task/`, `email/`, `shared/`). Runner `npm run test:unit` (`scripts/run-unit-tests.mjs`) executes them with coverage and **enforces a gate**; wired into `test:ci` (before E2E) and GitHub Actions.
- **Dedicated `_test` database** with a **no-override guard** (`assertTestDatabase`) — production can never be a target.
- **Runner** (`npm test`, fail-fast), **CI** (`test:ci` + build on ephemeral Postgres), **tooling** (`test:db:setup/reset/sweep`).

### Unit coverage gate (PQ-1)
- **Critical pure libraries — ≥ 90% each:** `analysis`, `matching`, `list-params`, `task-sort`, `permissions`.
- **Overall — ≥ 80%** across an explicit **tracked pure-module set** (critical + `env`, `note-links`, `password`, the email templates/registry). Mixed/DB-coupled modules (`invitations`, `org-settings`, `search`, transports) are **outside** the denominator — their query paths are E2E-tested (their pure guards still get unit regression tests).
- **Gate metric is BRANCH coverage, not line.** `node:test`'s V8 **line** coverage is unreliable under `tsx` — multi-line statements (return objects, template arrays) mis-map as "uncovered" even when executed, deflating line% regardless of test quality. Branch coverage maps accurately and is a stronger correctness signal; the runner gates on it and prints line% as advisory. **When the toolchain moves to Node 22+** (accurate native line coverage via `--test-coverage-lines`/`--test-coverage-include`), the custom gate script can be deleted and native thresholds used instead.
- The runner prints a per-module + overall coverage summary table with pass/fail marks every run.

## Target test pyramid

| Layer | Purpose | Status | Next |
|---|---|---|---|
| **Unit** | Pure logic correctness | 🟢 established (PQ-1) | Critical five + email/env/guards covered (branch-gated ≥90/≥80). Extend to more pure helpers as they appear |
| **Integration (E2E)** | Module behavior + org scope vs. real DB | ✅ strong | Add Documents, Analyzer-flow, Auth |
| **Regression** | Prevent re-breakage | 🟡 implicit | Written regression checklist per release; keep each fixed bug's test |
| **Performance** | Latency budgets | 🟢 baseline (PQ-3) | Instrumentation + seeded harness (`npm run perf:measure`) + recorded [baseline](./PERFORMANCE.md); PQ-4 optimizes against it |
| **Security** | Authz + isolation + inputs | 🟡 partial | Cross-org access tests; upload path-guard tests; authz-matrix tests |
| **Load** | Behavior at volume | 🔴 missing | Seeded large-org dataset; list/search under N rows |
| **Disaster Recovery** | Restore works | 🔴 missing | Backup + restore drill (see [Operations](./OPERATIONS_ROADMAP.md)) |

## Lint enforcement (PQ-2)
`npm run lint` (`next lint`, `eslint-config-next` defaults) is a **blocking CI gate** — a distinct "Lint" step between Typecheck and Unit Tests, so a failure names its own stage. Scope is the default Next surface (`app/`, `components/`, `lib/`); `tests/unit/**` and `scripts/*.mjs` are deliberately out of scope for now. Local `test:ci` is unchanged — developers run `npm run lint` explicitly. No rule promotions beyond Next defaults.

**Baseline cleanup (PQ-2):**

| Metric | Count |
|---|---|
| Initial violations | 0 |
| Autofixed (`next lint --fix`) | 0 |
| Manual fixes | 0 |
| Final (enforced) | **0** |

The codebase was already lint-clean under Next defaults — PQ-2 adds *enforcement*, not cleanup. (Verified the linter is live by planting and catching a throwaway `no-unused-vars` violation.)

## Priorities by release
- **1.1:** Unit tests for the pure `lib/*` modules — **done (PQ-1)**; lint in CI — **done (PQ-2)**; Documents + Auth E2E; performance budgets.
- **1.2:** Tests for enrichment provenance + refresh; migration tests once schema history exists.
- **1.3:** Worked-example unit tests for every underwriting formula (NOI, cap, DSCR, debt yield, cash flow, sensitivity); scenario-versioning tests.
- **1.4:** Closing-gate tests (cannot reach `PAID` without checklist); date-reminder tests.
- **2.0:** Per-AI-capability tests for correctness **and failure modes**; fallback-path tests; no-cross-tenant tests.

## Conventions
- Every E2E creates throwaway `e2e-*` orgs and cascade-cleans them; the guard blocks non-`_test` DBs.
- **Runner reliability ([D16](./TECHNICAL_DEBT.md)):** the sequential runner spawns one short-lived `tsx` child per script, each loading Prisma's native engine; on Node 20 a child can rarely die with **SIGSEGV (exit 139)** during native teardown (transient, not a test failure — re-run passes). Planned hardening: make `e2e-all.mjs` retry a script **once on a signal death** (distinct from an assertion-failure exit, which must still fail fast); the Node 22+ upgrade removes the root cause (and clears [D11]).
- Every fixed bug gets a test that would have caught it (regression).
- Pure logic lives in `lib/*` with no Prisma, so it's unit-testable in isolation.
- CI is the gate: distinct blocking steps — **Typecheck → Lint → Unit → E2E → Build** — must all pass before merge. Locally, `test:ci` (typecheck + unit + E2E) plus an explicit `npm run lint`.
- Unit tests live under `tests/unit/**` (never co-located), organized by module, imported with extensionless relative paths (`bundler` resolution) so `tsc --noEmit` type-checks them too.

## Tooling decisions
- **Unit runner:** ✅ **`node:test` + `tsx`** (zero new deps, matches the existing harness). Vitest and `c8` deliberately not adopted.
- **Coverage:** ✅ branch-gate proxy under Node 20 (see the gate note above); revisit with native thresholds after a Node 22+ upgrade.
- **Load/seed (open):** a scripted large-org seeder reusing the `_test` DB + guard.
- **Browser / visual-verification harness:** ✅ **`@playwright/test` (Chromium only)** — a **dev/test-only** dependency (never imported by `app/`/`lib/`/`components/`, so it is absent from the production runtime bundle). Introduced for the v1.4 Closing Center accordion slice to do authenticated, cross-viewport UI verification the pure/E2E layers can't (default-open, toggle + `aria` state, keyboard operability, role-gated controls, responsive wrapping of long values, no-mutation-on-toggle). Cypress/Puppeteer/jsdom deliberately **not** adopted.

### Playwright visual harness — how it works (`tests/visual/`, `playwright.config.ts`)
- **Isolation:** runs against the **`_test` DB** only (same `assertTestDatabase` guard as the e2e-`*`.mjs scripts). The web server is `next start` from the isolated **`.next-isolated`** build on port **3199** (an uncommon port — this is a shared host where 3100 etc. are taken; `reuseExistingServer: false` so Playwright always boots its own server and never silently reuses a foreign one).
- **Fixtures:** `seed.mjs` (run via `node --import tsx` in `globalSetup`, so the app's `@/` imports resolve the proven way) creates ONE throwaway `e2e-visual` org + ADMIN / CLOSING-writer / read-only users + opportunities covering every state (empty, blockers + long values, terminal, active-underwriting FC-0 reference). `globalTeardown` cascade-deletes the org and removes auth artifacts — verified to leave **0** residual orgs/users.
- **Auth:** session `storageState` is minted with the app's OWN signed-session format (HMAC over `userId.issuedAt` with the `_test` `SESSION_SECRET`) — no auth bypass, no app change — injected as a non-secure cookie for http localhost.
- **Screenshots** are **review evidence**, written under the git-ignored `tests/visual/.artifacts/`; they are NOT committed golden snapshots.
- **Commands:** `npm run test:visual` (build isolated + run), `npm run test:visual:closing` / `:screens` (focused), `npm run playwright:install` (Chromium).
- **Fresh test host (one-time, needs root):** `npx playwright install chromium` downloads the browser; the OS libraries it links against are installed with **`sudo npx playwright install-deps chromium`** (Ubuntu 24.04/noble; the concrete packages are `libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libxkbcommon0 libcups2t64`). If `install-deps` aborts, it is usually its internal `apt-get update` hitting a failing third-party repo — install the concrete packages directly (no `apt-get update`) using the already-fresh index. Verify with `ldd <chrome-headless-shell> | grep "not found"` → expect none. (Browser binaries and OS deps are **not** committed; only the harness code is.)
