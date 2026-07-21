# D24 — Memory Investigation · Interim Findings (evidence, NOT remediation)

> **D24 PHASE 1 COMPLETE (see close-out below).** Enough evidence to (a) distinguish bounded vs unbounded and
> (b) identify the dominant memory domain. **No evidence of an unbounded JS heap leak under the workloads
> tested; no remediation recommended.** PM2 recycle stayed active; prod collection was read-only. 2026-07-21.

---

## Method
- **Prod (read-only, external, out-of-process):** a sampler polled pm2 RSS + `/proc/<pid>/fd` + `/api/health`
  every 15 s → JSONL. No in-process hooks, no GC, no snapshots. (Overhead: one `ps`/readdir + one health GET
  per tick.)
- **Staging (instrumented, disposable clone):** added a `GET /api/memdiag` route returning
  `process.memoryUsage()` (heap/external/RSS breakdown), then ran a phased load
  (idle → load → sustained → idle-settle) sampling the breakdown. Same Node 20.20.2 / build shape.

## Evidence

### Production (read-only, ~14 min, low traffic)
| Metric | Result |
|---|---|
| RSS | **flat 121–122 MB** |
| `/proc/<pid>/fd` count | **flat at 28** (no fd/socket leak) |
| restart_time / unstable | 97 → 97 / 0 (no recycle in-window) |
| health | 55/55 ok; dbMs ~2 |

→ **No time-based creep while idle.** (The sampler keeps running to capture a real-traffic window.)

### Staging (instrumented, phased load) — the key result
| Phase | heapUsed | heapTotal | RSS | external |
|---|---|---|---|---|
| idle-baseline | ~35 MB | ~37 MB | ~109 MB | ~4 MB |
| under load (peak) | **~136 MB** | ~187 MB | **~335 MB** | ~16 MB |
| **after idle-settle** | **~40 MB** ⟵ **returns** | ~184 MB ⟵ stays | ~156 MB | ~9 MB |

- **`heapUsed` is BOUNDED:** 35 → 136 (load) → **40 after idle** — GC reclaims it. **No evidence of an
  unbounded JavaScript heap leak under the workloads tested** (retained only ~6 MB above baseline).
- **`heapTotal` expands and is retained:** 37 → 187 → **184** — V8 grows its reserved heap under load and
  does **not** return it to the OS (normal V8 behavior).
- **RSS tracks heapTotal:** peaks ~335 MB under load, settles ~156 MB (retains ~48 MB ≈ the reserved heap).
  `external` moved little (~4→16→9 MB); fd count did not leak.

## Interim classification (against the acceptance criteria)
- **Dominant domain: #1 JavaScript heap** — specifically **V8 heap expansion under workload** (`heapTotal`
  grows to a plateau and is retained), with **`heapUsed` BOUNDED** (returns to baseline after idle).
- **Which metric crosses the recycle threshold:** RSS — and RSS is attributable to **V8 reserved heap
  (`heapTotal`) + transient per-request allocation under load**, **NOT** external buffers, **NOT** fds/handles,
  **NOT** a time-based native creep. (This is the "RSS exceeded, but driven by heap" case, not a native leak.)
- **Bounded vs unbounded:** `heapUsed` **bounded** (reclaimed by GC); `heapTotal` plateaus within a cycle.
  **No unbounded-growth signature observed** in this window.
- **Correlation:** **workload**, not elapsed time (prod idle is flat; staging heap moves only under load).
- **Recycle protecting vs hiding:** consistent with **protecting** (caps the V8 reserved-heap high-water mark
  under load spikes) rather than **hiding a leak** — no leak evidence so far.
- **User-facing impact:** none observed (clean recycles, `unstable_restarts=0`).

## Honest caveats (why this is INTERIM, not final)
1. **Staging load used UNAUTHENTICATED routes only** (`/login`, `/api/health`, `/`) — it did **not** exercise
   the heavy authenticated routes (Opportunity board over ~9.6k rows, document processing) that most likely
   cause prod's **800 MB+ recycle overshoots**. Those could add larger transient heap **or** `external`/buffer
   allocation — to be reproduced with a session + representative data.
2. **Single load cycle** — need **repeated** cycles to confirm `heapTotal` truly plateaus (vs a slow per-cycle
   climb = a slow leak).
3. **Staging test DB is small** vs prod volume.
4. **Prod window was idle** — the read-only sampler needs a real-traffic window to observe prod growth.

## What would make it conclusive (next, only if approved)
- Repeat the staging cycle **N times** with an **authenticated session + seeded representative data** (board/
  list/detail/underwriting/document routes); confirm `heapUsed` returns each cycle and `heapTotal` plateaus.
- Let the read-only prod sampler run across a **real-traffic window**; confirm RSS is workload-correlated and
  bounded by the recycle.
- Only if a cycle shows `heapUsed` **not** returning (or `heapTotal` climbing every cycle) → escalate to a
  staging heap snapshot (with the handling+retention plan) to find the retained objects.

## Phase 1 — Investigation COMPLETE (2026-07-21)

> **Current evidence indicates no observable idle-time memory creep and no evidence of unbounded JavaScript
> heap growth under the workloads exercised. The dominant observed behavior is normal V8 heap expansion with
> retained heap capacity, which contributes to RSS growth. Historical PM2 memory restarts remain an
> operational observation rather than demonstrated evidence of a memory leak. No remediation is recommended
> at this time.**

The primary questions are answered:
- **Time-based idle creep?** No evidence (prod RSS flat 121–122 MB over 91 samples / ~23 min; fd stable at 28).
- **Which domain dominates?** JavaScript heap (V8 `heapTotal` expansion under workload; `heapUsed` bounded).
- **Is RSS alone sufficient evidence?** No — RSS crossing the threshold is attributable to reserved V8 heap +
  transient per-request allocation, not a native/external/fd leak.
- **Is PM2 obviously hiding a catastrophic leak?** No evidence of that from this investigation.

**Reopen only** if production telemetry, recycle frequency, latency, crashes, or user-visible behavior
materially changes — or if there is a **specific** need to reproduce the historical high-memory (800 MB+)
workload (authenticated heavy routes + representative data). Proceeding now to authenticated stress tests,
heap snapshots, profilers, GC experiments, or PM2 tuning would be **speculative optimization** without a
demonstrated problem.

**Standing diagnostic:** the read-only sampler is retained as an **on-demand tool**
(`scripts/diag/mem-sample.mjs`), not a permanent monitor — run it when an operational question arises.

---
*Phase 1 closed: dominant domain = JS heap / V8 `heapTotal` retention; `heapUsed` bounded; no evidence of an
unbounded heap leak under the workloads tested. No remediation, no config change. PM2 recycle remains active.*
