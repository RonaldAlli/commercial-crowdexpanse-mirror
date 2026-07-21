# D24 — Memory Investigation · Design & Evidence Plan (Phases 1–6)

> **Status: INVESTIGATION DESIGN · PENDING FOUNDER REVIEW — no remediation, no config/PM2/Node changes, no
> production profiling.** Acceptance-first. **The PM2 memory recycle STAYS ACTIVE** during the investigation
> (it is a safety mechanism; removing it before understanding the behavior increases risk).
>
> **Objective:** determine *why* prod memory grows and whether the 512 MB PM2 recycle is (a) normal &
> harmless, (b) masking a real leak, (c) caused by a route/job/integration/workload, or (d) too aggressive.
> **Distinguish HIGH memory usage from UNBOUNDED memory growth — they are not the same problem.**

---

## Phase 1 — Observed behavior (evidence only; NO conclusions)

Collected read-only 2026-07-21 (~12:35Z) from live pm2 + the pm2 daemon log:

| Fact | Value |
|---|---|
| PM2 process | `crowdexpanse-commercial` (id 3), **fork mode**, `next start -p 3030`, Node **v20.20.2** |
| Node args / NODE_OPTIONS | **none** (no `--max-old-space-size`, no GC flags) |
| `max_memory_restart` | **536,870,912 B = 512 MB** |
| Current RSS | **~121 MB** (126,758,912 B), CPU ~0.3% |
| Current uptime | **~85 min**, `restart_time` 97, **`unstable_restarts` 0** |
| Host memory | 7.9 GB total; **~5.4 GB available**; app is a small fraction |
| Health | `status:ok`, `dbMs` 33.7 (one sample; was 1–2 ms during the D25 window — single-point, not a trend) |
| **Recycle signature** (pm2.log) | `[PM2][WORKER] Process 3 restarted because it exceeds --max-memory-restart value (current_memory=… max_memory_limit=536870912)` |
| Recorded recycle samples (`current_memory` at recycle) | 516 MB, **828 MB**, 577 MB, **849 MB**, 539 MB |
| Recycle cadence | **intermittent** — clusters + singletons across days; some coincide with the *old in-place deploys* (07-20 02:46/02:48 window), others organic (07-20 03:20, 05:19; 07-21 07:05). **No recycle since the D25 migration (11:10Z).** |
| Restart character | **all planned recycles** (`unstable_restarts=0`) — clean restart + health recovery, no crash loop |
| User-facing impact | none observed to date (recycle = a ~1–2 s restart; health recovers) — **to be confirmed by the measurement plan, not assumed** |

**Two raw observations to explain later (NOT conclusions):**
1. The app is currently **far below** the threshold (121 MB @ 85 min) — a single point cannot show growth.
2. Several recycles **overshot to 800 MB+**, well past 512 MB — either bursty transient allocation (a request/
   job) between pm2's periodic checks, or fast growth. This is the single most interesting signal.

---

## Phase 2 — Measurement model

**Goal: correlate memory with actual WORK, not observe RSS in isolation.** Timestamped, machine-readable
(JSONL). One sample shape (superset; not all fields are prod-safe — see split below):
```json
{ "ts":"…","rss":0,"heapUsed":0,"heapTotal":0,"external":0,"arrayBuffers":0,
  "eventLoopDelayP50":0,"eventLoopDelayP99":0,"cpu":0,"reqTotal":0,"reqByRoute":{},
  "activeHandles":0,"activeRequests":0,"pm2RestartTime":0,"pm2UnstableRestarts":0,
  "health":"ok","dbMs":0 }
```

| Field | Prod (read-only, low overhead) | Requires in-process access |
|---|---|---|
| `rss`, `cpu` | ✅ pm2 `monit` / `ps` | |
| `pm2RestartTime`, `pm2UnstableRestarts` | ✅ pm2 jlist | |
| `health`, `dbMs` | ✅ `/api/health` | |
| `reqTotal`, `reqByRoute` | ⚠️ only if an access log / proxy metric exists read-only | else in-process |
| `heapUsed/Total`, `external`, `arrayBuffers` | ✗ | ✅ `process.memoryUsage()` |
| `eventLoopDelayP50/P99` | ✗ | ✅ `perf_hooks.monitorEventLoopDelay()` |
| `activeHandles/Requests` | ✗ | ✅ `process._getActiveHandles()` (dev/diagnostic only) |

**Plan (executed only after review):**
- **Prod = RSS trend + recycle events, read-only.** A tiny sampler (e.g. `scripts/diag/mem-sample.mjs`,
  **to be written after approval**) reads pm2 `monit` RSS + counters + `/api/health` every N seconds → JSONL;
  plus parse the pm2.log recycle lines into a `current_memory`-at-recycle series. **No in-process hooks, no
  GC, no snapshots on prod.** This answers *bounded vs unbounded* + cadence + host correlation.
- **Full heap breakdown = staging** (Phase 6), where a diagnostic probe (`process.memoryUsage()` +
  `monitorEventLoopDelay` + optional `--expose-gc`) is safe. This splits *which category grows* (heap vs
  external vs native/RSS) and *whether it returns after idle/GC*.

---

## Phase 3 — Classify by memory DOMAIN first, THEN rank causes

**Do not rank individual causes until the growing DOMAIN is identified** (this usually collapses the search
space dramatically). Classify the growth into one of four domains, then only evaluate that domain's causes.

| Domain | Diagnostic questions | Metrics | Candidate causes (hypotheses) |
|---|---|---|---|
| **1. JavaScript heap** | Is `heapUsed` growing? Does it plateau? Shrink after idle? Shrink after GC (staging)? | `heapUsed`, `heapTotal` | retained objects / caches / closures / timers / ORM objects — **H1, H3, H4, H5, H10, H11, H12** |
| **2. Native / RSS** | Is RSS growing while heap is flat? Allocator fragmentation? | `rss` vs `heapTotal` | native libs / OpenSSL / image/compression / glibc allocator arenas — **H2** |
| **3. External memory** | Buffers? Streams? Uploads? File handling? | `external`, `arrayBuffers` | upload/doc buffers / streams / SDK buffers — **H7, H13** |
| **4. OS / process resources** | Descriptors? Sockets? Handles? Timers? Event-loop resources? | `/proc/<pid>/fd`, `activeHandles`, event-loop delay | unclosed fds/sockets / leaked handles/timers — **H6, H5** |

**Rule:** identify the dominant domain from the metric split (heap vs external vs RSS-minus-heap vs
fd/handle count), *then* rank within it. The register below is the per-cause detail used **after** the domain
is known.

### Hypothesis register (per-cause detail; each with support / disprove / least-invasive test)

| # | Hypothesis | Supports it | Disproves it | Least-invasive test |
|---|---|---|---|---|
| H1 | **Normal V8 heap expansion/retention** (heap grows to a plateau, GC reclaims) | RSS oscillates + plateaus; heapUsed sawtooths under GC | monotonic RSS with no plateau across idle | staging: idle→load→idle, watch heapUsed after GC |
| H2 | **Native/allocator fragmentation** (glibc malloc arenas; RSS high, heap not) | RSS ≫ heapTotal; RSS doesn't drop after GC | RSS tracks heapTotal | staging: compare RSS vs heapTotal; try `MALLOC_ARENA_MAX` **in staging only** |
| H3 | **Unbounded in-process cache** (module-level Map/obj) | heapUsed grows with unique keys; never released | heap flat under repeat identical requests | grep for module-level `Map`/`{}` caches; staging load w/ varied keys |
| H4 | **Retained Prisma/DB objects** (client caches, large result sets held) | external/heap grows with query volume; correlates with `dbMs` | flat under query load | staging: hammer read routes, watch heap + external |
| H5 | **Growing queues / timers / intervals** | `activeHandles` climbs; setInterval leak | handles flat | staging: `_getActiveHandles()` over time (dev) |
| H6 | **File/stream handles** (unclosed fds) | fd count climbs (`/proc/<pid>/fd`) | fd flat | prod-safe: `ls /proc/<pid>/fd | wc -l` trend (read-only) |
| H7 | **Large uploads / document processing** (buffers held) | `arrayBuffers`/external spikes with upload routes | flat without uploads | staging: exercise upload/doc routes, watch external |
| H8 | **Next.js SSR / fetch cache growth** | heap grows with distinct SSR routes; Next data cache | flat across repeated same route | staging: cycle many distinct dynamic routes |
| H9 | **Background jobs** (automation — but executor is PAUSED/absent, D19) | growth on job cadence | no jobs running (executor absent) ⇒ likely N/A now | confirm no executor running (pm2/logs) |
| H10 | **Repeated module init / route recompiles** | heap steps up per route first-hit | flat after warm | staging: first-hit vs warm route memory |
| H11 | **Request/response retained by closures** | heap grows per request, never freed | heap returns after load | staging: sustained load then idle, measure retained |
| H12 | **Logging buffers** (in-memory log accumulation) | heap grows with log volume | flat | inspect logger config; staging load |
| H13 | **Third-party SDK retention** (email/etc.) | external grows on integration use | integrations idle (email=console) ⇒ likely low | staging: exercise integrations |

*Prior ranking:* the **overshoot-to-800 MB** signal favors **H7/H4/H11** (bursty per-request allocation) or
**H1/H2** (plateau vs fragmentation); **H9** is likely N/A (automation executor absent per D19). Ranking is a
starting point, revised by evidence.

---

## Phase 4 — Acceptance criteria (investigation is "done" only when it answers)
1. Is memory growth **bounded or unbounded**?
2. **Which category** grows — heap, external, native/RSS, or several?
3. Is growth correlated with **traffic, a route, a job, or elapsed time**?
4. Does memory **return** after idle / forced GC in a **controlled non-prod** test?
5. Is the PM2 recycle **protecting the system or hiding a defect**?
6. Is there **user-facing impact**?
7. Is **remediation required**?
8. **What evidence** supports the conclusion?

**Explicit criteria:**
- *A remediation must NOT be proposed solely because RSS is high.* High steady-state usage with bounded
  growth + clean recycles is an acceptable operating point, not a defect.
- *The investigation must identify **which memory metric crosses the recycle threshold** — not merely that
  PM2 restarts.* "RSS exceeded while heap stayed flat" (⇒ native/external/fragmentation) is a **different
  conclusion** from "heap exceeded" (⇒ JS retention). The recycle line's `current_memory` is RSS; the
  investigation must attribute that RSS to a domain (heap vs external vs native) at the moment of crossing.

---

## Phase 5 — Investigation safety (production)
Production collection is **read-only + low overhead**. During the investigation we do **NOT**:
- enable continuous heap snapshots in prod, force GC in prod, or attach a heavy profiler;
- lower/raise the PM2 threshold, or disable automatic recycling;
- restart prod merely to collect cleaner data;
- run synthetic load against prod.

**Heap snapshots can contain sensitive application data** → they require an explicit **handling + retention
plan** (staging only, access-controlled, deleted after analysis) **before** any capture. The PM2 recycle
**remains active** unless evidence shows it prevents meaningful measurement (then re-evaluate, with review).

**Diagnostic overhead budget (must be measured + documented before it runs).** Any diagnostic added to
production must itself have measurable, bounded overhead, or it risks influencing the system it measures. For
each collector, document: **sampling interval**, **CPU cost**, **memory cost**, **I/O generated (bytes/day)**.
- **Prod sampler = EXTERNAL + read-only** (design): a separate process polls pm2 `monit` RSS + `/proc/<pid>/fd`
  count + `/api/health` on an interval (target ≥ 10 s). It runs **out-of-process** → it adds **no heap/CPU to
  the app**; cost is one `ps`/readlink + one HTTP GET per tick (µs of app CPU for the health handler) and a
  few hundred bytes/sample of JSONL (~a few MB/day, rotated). No in-process hooks, no GC, no snapshots on prod.
- Any richer probe (heap breakdown, event-loop delay) is **staging-only**; its overhead is documented there
  too. If a diagnostic's overhead cannot be bounded and shown negligible, it does not run on prod.

---

## Phase 6 — Controlled reproduction (staging)
On the isolated staging instance (same Node 20.20.2, same build, test DB, representative data volume where
practical):
```
clean start → idle baseline (settle) → controlled workload → sustained workload →
idle/settling period → optional controlled GC (--expose-gc) → compare retained memory
```
Instrument staging with a diagnostic probe (`process.memoryUsage()` + `monitorEventLoopDelay` + fd count) →
JSONL. Drive representative routes (read APIs, board/list, uploads/doc routes, SSR pages). Compare
heap/external/RSS across phases; the **idle-after-load** delta and **post-GC** delta are the key leak signals
(retained memory that never returns ⇒ leak; returns ⇒ retention/plateau).

---

## Go / No-Go for deeper profiling
Proceed to heap snapshots / allocation profiling **only if** the read-only prod trend + staging reproduction
show **unbounded, non-returning growth** in a specific category — and only **on staging**, with a
snapshot handling+retention plan approved. If growth is bounded / returns after idle/GC / recycles are clean
with no user impact → **No-Go on deeper profiling**; conclude "normal retention + adequate recycle" (candidate:
optionally tune the threshold or add `--max-old-space-size`, but **only** with evidence, not because RSS is high).

## Deliverables (this document) + next step
✅ current-memory baseline (Phase 1) · ✅ measurement schema + collection plan (Phase 2) · ✅ hypothesis
register (Phase 3) · ✅ acceptance criteria (Phase 4) · ✅ production safety constraints (Phase 5) · ✅ staging
reproduction plan (Phase 6) · ✅ Go/No-Go for deeper profiling. **Then STOP for review** — the read-only prod
sampler + the staging reproduction are executed only **after** approval.

---
*Stop point: D24 investigation designed + baseline captured (read-only). No remediation, config change, or
profiling performed. PM2 recycle remains active. Awaiting review before executing the measurement plan.*
