# Volume 11 — Performance Baseline & Budgets

> **Status:** PQ-3 (instrumentation) complete — the baseline below is what PQ-4 optimizes against. **PQ-4a (board payload narrowing) shipped** — see the [optimization records](#pq-4-optimization-records-evidence-driven).
> **Last measured:** 2026-07-14.

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

## PQ-4 optimization records (evidence-driven)
Every optimization is recorded here with its target, baseline, change, new measurement, % improvement, and a regression check. No optimization ships without a measured win against the PQ-3 baseline above. Tooling: `npm run perf:measure` (before/after latency) and `npm run perf:explain` (`scripts/perf-explain.mjs`, `EXPLAIN (ANALYZE, VERBOSE, BUFFERS)` on the mirrored SQL shapes).

### PQ-4a — Board payload narrowing (2026-07-14) ✅ shipped
- **Target:** Opportunities **Board** query (`loadBoardOpportunities`) — the only path the baseline flagged as worth watching (loads every org opportunity, no pagination, ~15–50× the lists).
- **Baseline:** PQ-3 board p50 66.8 ms / **p95 109.5 ms**. Confirmed pre-change this session at p50 73.67 / p95 90.84 (same harness).
- **Change:** the board query previously reused the list view's `include` (all **15** Opportunity scalars + property `{name, city, state, assetType}` + seller `{name}`). The board card renders only **six** Opportunity scalars (`id, title, stage, priority, contractValueUsd, assignmentFeeUsd`) + property `{name, assetType}` — no seller, no target-close date. Introduced a dedicated `BOARD_SELECT` (a Prisma `select`, propertyId FK auto-added for the relation) used **only** by the board; the list path keeps `OPP_INCLUDE` unchanged. No index, schema, or pagination change.
- **`EXPLAIN` evidence:** driving-query row **width 197 → 97 bytes**; sort working memory **210 kB → 110 kB**; property relation projection **42 → 31 bytes/row**; the **seller relation query is eliminated entirely** (its own seq-scan + hash-join no longer issued).
- **New measurement (same process, apples-to-apples, 22 samples):**

  | Board shape | p50 | p95 | mean |
  |---|---|---|---|
  | Legacy `include` (pre-PQ-4) | 71.21 ms | 101.17 ms | 75.53 ms |
  | **Narrowed `select` (PQ-4a)** | **30.55 ms** | **43.16 ms** | **32.76 ms** |

- **Improvement:** **p50 −57.1%, p95 −57.3%, mean −56.6%.** Board p95 falls from ~101 ms to **~43 ms** (well under the 300 ms budget, with far more headroom as volume grows).
- **Regression check:** all other paths unchanged within run-to-run noise — Search p95 13.65 (was 11.5), lists p95 ≤ 8.34 (Seller 3.05, Buyer 3.90, Property 8.34, Opp 3.90, Task 7.81). The list view still uses `OPP_INCLUDE` (its type/columns untouched); `npm run typecheck` confirms the board card accesses no field outside `BOARD_SELECT`. No regression.

### Board budget (post-PQ-4a)
| Path | Budget | Pre-PQ-4a p95 | Post-PQ-4a p95 | Status |
|---|---|---|---|---|
| Board | < 300 ms | 109.5 ms | **43.2 ms** | ✅ within (−57%) |

## PQ-4 — remaining (conditional, only if a new measurement justifies)
Board **pagination/virtualization** and any **`EXPLAIN`-verified index** are deferred: at the current dataset the narrowed board is comfortably within budget, so neither is justified by a number yet. Re-measure before adding either. Caching remains out of Version 1.1.
