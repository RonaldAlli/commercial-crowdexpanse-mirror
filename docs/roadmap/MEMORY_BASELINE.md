# CrowdExpanse Commercial — Memory Baseline

> **A reference card of the known-good memory operating characteristics** for `crowdexpanse-commercial`, so
> future engineers have something concrete to compare against. **Not an investigation** — it records the
> conclusion of [D24 Phase 1](./D24_MEMORY_FINDINGS_INTERIM.md). Complements the Product / Operations /
> Engineering / Deployment baselines.

---

## Known-good operating characteristics (as of 2026-07-21)
| Property | Value |
|---|---|
| Node version | **v20.20.2** (fork mode; **no** `--max-old-space-size` / GC flags) |
| PM2 `max_memory_restart` | **512 MB** (536,870,912 B) |
| Typical **idle RSS** (prod) | **~121 MB** (flat over a 23-min read-only window; fd steady ~28) |
| Typical **idle heap** (measured on staging, same build) | `heapUsed` ~35 MB · `heapTotal` ~37 MB · `external` ~4 MB |
| Under-**load** heap (staging) | `heapUsed` spikes (→ ~136 MB) then **returns to ~baseline after idle**; `heapTotal` expands to a plateau (~184 MB) and is **retained** by V8; RSS tracks `heapTotal` (peaked ~335 MB under the test load) |
| **Recycle behavior** | **Infrequent + planned.** PM2 recycles when RSS crosses 512 MB under workload (`[PM2][WORKER] … exceeds --max-memory-restart`), sometimes overshooting to **800 MB+**; `unstable_restarts=0`; clean restart + health recovery (~1–2 s). **Restart count is NOT a release metric** (Operations Baseline). |
| Health | `/api/health` `status:ok`; `dbMs` ~1–3 ms typical |

## D24 Phase 1 conclusion (the reference)
- **Dominant memory domain: JavaScript heap** — normal **V8 heap expansion under workload** with retained
  heap capacity (`heapTotal`), which is what drives RSS toward the 512 MB recycle.
- **No observable idle-time memory creep**; **no evidence of an unbounded JavaScript heap leak under the
  workloads tested** (`heapUsed` is reclaimed by GC after load).
- **RSS alone is not evidence of a leak** — the RSS crossing the threshold is reserved V8 heap + transient
  per-request allocation, **not** native/external/fd growth or a time-based creep.
- **The PM2 recycle is an appropriate operational safeguard** (bounds the V8 reserved-heap high-water mark),
  **not** a mask for a demonstrated leak. **No remediation recommended.**

## When to reopen the investigation
Reopen **only** on a concrete operational trigger, not on high RSS alone:
- recycle **cadence rising** (more frequent than the historical intermittent pattern),
- latency or event-loop degradation,
- crashes / `unstable_restarts > 0`,
- user-visible behavior change,
- or a **specific** need to reproduce the historical **800 MB+** workload (authenticated heavy routes —
  Opportunity board over ~9.6k rows, document processing — with representative data + repeated cycles).

Then escalate per the [D24 design](./D24_MEMORY_INVESTIGATION_DESIGN.md) (authenticated staging reproduction →,
only if `heapUsed` stops returning, a staging heap snapshot with a handling+retention plan).

## Standing diagnostic
Read-only, on-demand (NOT a permanent monitor): `node scripts/diag/mem-sample.mjs <out.jsonl> [interval] [seconds]`
→ external RSS + fd + health trend. Run it when one of the triggers above appears.

---
*Reference only. Values are the current known-good; update if a future D24 phase re-measures.*
