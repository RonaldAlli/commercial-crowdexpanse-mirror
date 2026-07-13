# Volume 11 — Performance Baseline & Budgets

> **Status:** PQ-3 (instrumentation) complete — this is the measured baseline PQ-4 optimizes against. **PQ-3 is strictly observational: no index, query, or caching change was made.**
> **Last measured:** 2026-07-13.

## How this is measured
- **Harness:** `npm run perf:measure` (`scripts/perf-measure.mjs`) against the dedicated **`_test`** DB (behind the no-override guard). Seeds a reproducible perf org (`scripts/seed-perf.mjs`, index-derived fields, explicit ids — no randomness), then times each hot **read path** 25× (3 warmup discarded) and reports nearest-rank percentiles.
- **Fidelity:** the harness **replicates the exact query shapes** the app uses (board `findMany` + includes, `searchAll`, list `count` + page-1 fetch). It does **not** modify any `app/`/`lib/` query — measurement only.
- **Instrumentation:** `lib/telemetry.ts` (zero-dep `withTiming`/`percentiles`/`logEvent`), dev-gated (`NODE_ENV !== "production"` or `INSTRUMENT=1`) — quiet in production by default. `/api/health` exposes a live DB-latency signal (`dbMs`).

## Dataset (part of the baseline)
**1,000 opportunities · 2,000 properties · 5,000 tasks · 500 buyers · 300 sellers** (single org). Latencies are only meaningful tied to this size; re-measure at the same size to compare over time.

## Baseline (local `_test`, Postgres 16, 22 samples/path)

| Path | Dataset | p50 | p95 | p99 | mean |
|---|---|---|---|---|---|
| **Board** (opportunities + includes) | 1,000 opps | 66.8 ms | **109.5 ms** | 156.0 ms | 72.8 ms |
| **Global Search** ("Atlanta") | 2,000 props / 300 sellers | 9.4 ms | 11.5 ms | 12.7 ms | 9.5 ms |
| Seller list (count + page 1) | 300 sellers | 1.9 ms | 3.1 ms | 3.8 ms | 2.1 ms |
| Buyer list (count + page 1) | 500 buyers | 2.9 ms | 4.3 ms | 4.8 ms | 3.1 ms |
| Property list (count + page 1) | 2,000 props | 5.8 ms | 7.6 ms | 7.6 ms | 6.1 ms |
| Opportunity list (count + page 1) | 1,000 opps | 3.7 ms | 4.5 ms | 4.7 ms | 3.7 ms |
| Task list (count + page 1) | 5,000 tasks | 5.9 ms | 7.0 ms | 11.6 ms | 6.3 ms |

> Measured on the dev host DB; absolute numbers will differ on production hardware, but the **relative profile** holds.

## Latency budgets (p95, at the dataset above)
| Path | Budget | Baseline | Status |
|---|---|---|---|
| Board | < 300 ms | 109.5 ms | ✅ within |
| Global Search | < 250 ms | 11.5 ms | ✅ within |
| Lists (each) | < 200 ms | ≤ 7.6 ms | ✅ within |

## Reading of the baseline (informs PQ-4, no action in PQ-3)
- **The board is the one path worth watching.** It loads **every** org opportunity with includes (no pagination) and dominates the profile (~15–50× the lists). It's within budget at 1k opps but is the natural first target if opportunity volume grows — board-view pagination/virtualization or a lighter select is the likely PQ-4 lever.
- **Lists and search are comfortably fast** and already indexed on `organizationId`. No evidence yet justifies new indexes; PQ-4 should confirm with `EXPLAIN` before adding any.
- **Everything is within the proposed budgets today** — so PQ-4 is about *headroom as data grows*, not fixing a current regression.

## PQ-4 (next — optimization, evidence-driven)
Only changes justified by a number above: board pagination/lighter payload; `EXPLAIN`-verified indexes for any path that regresses at higher volume; targeted N+1 review. Re-run `npm run perf:measure` after each change and compare against this table.
