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
| **Performance** | Latency budgets | 🔴 missing | p95 budgets for board + search; query timing in dev |
| **Security** | Authz + isolation + inputs | 🟡 partial | Cross-org access tests; upload path-guard tests; authz-matrix tests |
| **Load** | Behavior at volume | 🔴 missing | Seeded large-org dataset; list/search under N rows |
| **Disaster Recovery** | Restore works | 🔴 missing | Backup + restore drill (see [Operations](./OPERATIONS_ROADMAP.md)) |

## Priorities by release
- **1.1:** Unit tests for the pure `lib/*` modules — **done (PQ-1)**; add lint to CI (**PQ-2, next**); Documents + Auth E2E; performance budgets.
- **1.2:** Tests for enrichment provenance + refresh; migration tests once schema history exists.
- **1.3:** Worked-example unit tests for every underwriting formula (NOI, cap, DSCR, debt yield, cash flow, sensitivity); scenario-versioning tests.
- **1.4:** Closing-gate tests (cannot reach `PAID` without checklist); date-reminder tests.
- **2.0:** Per-AI-capability tests for correctness **and failure modes**; fallback-path tests; no-cross-tenant tests.

## Conventions
- Every E2E creates throwaway `e2e-*` orgs and cascade-cleans them; the guard blocks non-`_test` DBs.
- Every fixed bug gets a test that would have caught it (regression).
- Pure logic lives in `lib/*` with no Prisma, so it's unit-testable in isolation.
- CI is the gate: `test:ci` (typecheck + **unit** + full E2E) + build must pass before merge.
- Unit tests live under `tests/unit/**` (never co-located), organized by module, imported with extensionless relative paths (`bundler` resolution) so `tsc --noEmit` type-checks them too.

## Tooling decisions
- **Unit runner:** ✅ **`node:test` + `tsx`** (zero new deps, matches the existing harness). Vitest and `c8` deliberately not adopted.
- **Coverage:** ✅ branch-gate proxy under Node 20 (see the gate note above); revisit with native thresholds after a Node 22+ upgrade.
- **Load/seed (open):** a scripted large-org seeder reusing the `_test` DB + guard.
