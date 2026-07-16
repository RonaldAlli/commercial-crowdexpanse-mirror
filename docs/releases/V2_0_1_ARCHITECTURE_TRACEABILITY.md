# Version 2.0 · Phase 2.0.1 — Architecture Traceability Matrix

> **Status: ✅ FOUNDER ACCEPTED (2026-07-16 · Founder: Ronald Delroy Anthony Allicock · accepted
> reviewed tip `18b835d`).** Read-only review aid. No code, schema, migration, or production
> state is changed by this document. It maps every ratified Version 2.0 Automation
> refinement (A1–A8) and invariant (AU-1…AU-13) to its implementing code, enforcing mechanism,
> proving test, acceptance evidence, and any limitation or deferral — grounded in the actual
> repository at branch `feature/v2.0.1-automation-foundation`.
>
> **Companions:** [Implementation Acceptance](./V2_0_1_IMPLEMENTATION_ACCEPTANCE.md) ·
> [Architecture Lock](../architecture/AUTOMATION_ARCHITECTURE_LOCK.md) ·
> [Acceptance Criteria](../architecture/VERSION_2_0_PHASE_2_0_1_ACCEPTANCE_CRITERIA.md) ·
> [Runbook](../architecture/VERSION_2_0_PHASE_2_0_1_RUNBOOK.md).
>
> **Legend (status):** `PROVEN` (implemented + test-enforced) · `PARTIALLY` (foundation
> implemented, remainder reserved) · `RESERVED` (enum/type placeholder exists, not exercised) ·
> `DEFERRED` (intentionally out of Phase 2.0.1). A deferred capability is **never** described as
> implemented.
>
> File references use repository-relative paths with stable symbol names and line numbers as of
> branch tip. Line numbers are a convenience; symbol names are authoritative.

---

## Part 1 — Architecture refinements (A1–A8)

| A# | Refinement | Phase 2.0.1 disposition | Implementing code | Proving test |
|---|---|---|---|---|
| **A1** | Automation as a bounded domain (owns orchestration only) | **PARTIALLY** — the two foundational entities are implemented (`AutomationJob`, immutable `AutomationExecution`); `AutomationPolicy` is realized as **pure versioned code**, not a table; `AutomationProposal` / `AutomationAction` / `AutomationResult` are **RESERVED** for later phases (no committing automation exists yet) | `prisma/schema.prisma` `model AutomationJob` (L1863), `model AutomationExecution` (L1906); `lib/automation/policy.ts` (`POLICY_VERSION` L9) | `e2e-automation.mjs` [29] (domain-no-change); `tests/unit/automation/policy.test.ts` |
| **A2** | Scheduling ↔ execution separation (5 independently-replaceable layers; a scheduled job never mutates a domain directly) | **PROVEN** — each layer is a distinct module | Scheduler `lib/automation/scheduler.ts` (`runSchedulerOnce` L45); Queue `lib/automation/job-service.ts` (`claimDueJobs` L113, `FOR UPDATE SKIP LOCKED` L122); Executor `lib/automation/executor.ts` (`runClaimedJob` L53); Policy `lib/automation/policy.ts` (`evaluatePolicy` L37) | `e2e-automation.mjs` [12] (import ≠ execution), [17] (scheduler), [13] (executor is sole actor) |
| **A3** | Automation Principal (explicit non-user identity) | **PARTIALLY / PROVEN for AUTOMATION** — the `AUTOMATION` principal is fully implemented; `SYSTEM`/`WEBHOOK` enum values exist but are **RESERVED** (no webhook path in 2.0.1) | `lib/automation/principal.ts` (`automationPrincipalKey` L10); `lib/automation/types.ts` (`AutomationPrincipal` L56, `type: Extract<…,"AUTOMATION">`); enum `AutomationPrincipalType` schema L1844 | `e2e-automation.mjs` [19] (`principalType=AUTOMATION`, `actorId=null`) |
| **A4** | Mandatory policy layer (Projection → Policy → RBAC → Execution) | **PROVEN** — policy is evaluated before every `perform()`; only `ALLOW` performs | `lib/automation/executor.ts` L59 (`handler.policy(context)` before L60 `if (decision.kind === "ALLOW")`); RBAC `lib/permissions.ts` `AUTOMATION` (L98) + `canRequeueAutomationJob` (L175) | `e2e-automation.mjs` [14] (`perform()` never called on DENY/NO_ACTION/STALE_CONTEXT); `policy.test.ts` |
| **A5** | AI versioning model (five version stamps) | **DEFERRED** — **no AI exists in Phase 2.0.1.** Of the five stamps, only `policyVersion` is present (governing the automation policy, not an AI call); prompt/model/schema/evaluation versions are **not implemented** | — (intentionally absent) | AI/provider/network scan = none (Acceptance §Test Evidence) |
| **A6** | Event-driven preference (transactional outbox over polling) | **DEFERRED to Phase 2.0.2** — 2.0.1 is **schedule-triggered by design** to avoid touching frozen V1.x domain transactions. The `AutomationTriggerType` enum **RESERVES** `DOMAIN_EVENT`/`WEBHOOK`; only `SCHEDULE` is used | enum `AutomationTriggerType` schema L1811 (`SCHEDULE` used; `DOMAIN_EVENT`/`WEBHOOK`/`MANUAL` reserved) | `e2e-automation.mjs` [17] (schedule seeding) |
| **A7** | Automation health & operations (read projection over executions + queue) | **PROVEN (projection + endpoint)** — the operational dashboard *UI* is a later phase, but the read projection and ADMIN endpoint exist and recompute nothing | Pure `lib/automation/health.ts` (`projectHealth` L46); read `lib/automation/job-service.ts` (`fetchAutomationHealth` L283); route `app/api/automation/health/route.ts` | `tests/unit/automation/health.test.ts`; `e2e-automation.mjs` [31] |
| **A8** | Immutable `AutomationExecution` ledger (the primary addition) | **PROVEN** — insert-only; the sole writer is a single `create` | `lib/automation/job-service.ts` `finalizeJob` L186 (only `tx.automationExecution.create` L192; **no update/delete path** in the module) | `e2e-automation.mjs` [7] (prior attempt byte-for-byte unchanged after retry), [8] (attempt-uniqueness) |

---

## Part 2 — Locked invariants (AU-1 … AU-13)

### AU-1 — Automation owns only its own records, never business truth
- **Statement:** Automation may create/read/update only its own policy/job/execution records; never Underwriting/Closing/Escrow/Financing/Assignment/Opportunity/Documents/Intelligence truth.
- **Implementation:** `lib/automation/proof-observer.ts` — the only handler; `perform()` (L115) returns `producedDomainEffect: false` (L120) and writes nothing; `gatherContext` only **reads** via `prisma.opportunity.findFirst` (L48).
- **Failure mode if violated:** a domain row would change across a run.
- **Test:** `e2e-automation.mjs` [29] snapshots Opportunity/Escrow/Financing/Assignment/checklist/AUTOMATION-activity **before and after** a real executor run and asserts byte-for-byte equality.
- **Status: PROVEN.**

### AU-2 — Layer separation; a scheduled job never invokes a domain mutation directly
- **Statement:** Scheduler → Queue → Executor → Policy → Domain Service → ActivityLog are independently replaceable; no "worker that just writes the row."
- **Implementation:** distinct modules (see A2 row). Importing the executor/reaper/scheduler has **no side effects** — the loop starts only via `startExecutorLoop` (`executor.ts` L147).
- **Failure mode:** importing a module, or a scheduler pass, would perform work.
- **Test:** `e2e-automation.mjs` [12] (a QUEUED job is untouched until an executor is explicitly run).
- **Status: PROVEN.**

### AU-3 — Automation never impersonates a user; every action explicitly attributed
- **Statement:** Automation inherits org context only, never a user identity; every automated row is attributed to the AUTOMATION principal.
- **Implementation:** `lib/automation/activity.ts` L37 (`actorId: null`), L38 (`actorType: "AUTOMATION"`); `lib/automation/types.ts` `AutomationPrincipal.type` is `Extract<…,"AUTOMATION">` (L57); `finalizeJob` sets `principalType: "AUTOMATION"` (`job-service.ts` L211).
- **Failure mode:** an automated row carrying a real `actorId`/USER attribution.
- **Test:** `e2e-automation.mjs` [19] (`actorType=AUTOMATION`, `actorId=null`, linked to execution); [29] (`principalKey = automation:closing_readiness_observation`).
- **Status: PROVEN.**

### AU-4 — Mandatory policy precedes every action; no bypass
- **Statement:** Every automated action passes Projection → Policy → RBAC → Execution; no path skips policy.
- **Implementation:** `executor.ts` L59 evaluates `handler.policy(context)` **before** the `ALLOW`-only `perform()` (L60–61); the non-ALLOW branch finalizes a clean `NOOP` (L82) and never calls `perform`.
- **Failure mode:** `perform()` running under a DENY/NO_ACTION/STALE_CONTEXT decision.
- **Test:** `e2e-automation.mjs` [14] (perform not called for each non-ALLOW kind); `policy.test.ts` (decision ordering, determinism).
- **Status: PROVEN.**

### AU-5 — Advisory-until-accepted (proposal workflow)
- **Statement:** Outputs are proposals; effects occur only on human accept via the real seam (or an explicitly ratified advisory-notification policy).
- **Implementation:** **RESERVED** — `AutomationDecision` reserves `REQUIRE_APPROVAL` (`types.ts` L34) but the 2.0.1 proof policy **never returns it** (documented L28–29); there is **no** `AutomationProposal` model and **no effect-producing automation**, so the "effects only on accept" rule holds by construction (nothing produces an effect).
- **Failure mode (future):** an automation committing a domain effect without human acceptance.
- **Test:** `policy.test.ts` (proof policy returns only ALLOW/DENY/NO_ACTION/STALE_CONTEXT); `e2e-automation.mjs` [29] (no effect).
- **Status: RESERVED** (proposal workflow DEFERRED; no effect path exists to violate it).

### AU-6 — Idempotency + retry classification + dead-letter
- **Statement:** Idempotency by logical identity; retries via classification (transient/permanent); terminal FAILED = dead-letter; reversibility only via the domain's own lifecycle.
- **Implementation:** compound key `@@unique(...)` `automation_job_idempotency` (schema L1895; migration unique index) enforced by read-check-then-create `enqueueJob` (`job-service.ts` L64, P2002 re-read L86); backoff `lifecycle.ts` `backoffMs` (L100) / `nextAttemptAt` (L107); disposition `failureDisposition` (L81) / `nextStatusAfterFailure` (L89, → `DEAD_LETTERED` when exhausted). Reversibility-via-domain-lifecycle is **N/A** (no effects in 2.0.1).
- **Failure mode:** duplicate jobs for one occurrence; a retryable error dead-lettering (or a permanent error retrying forever).
- **Test:** `e2e-automation.mjs` [1]/[2] (idempotent enqueue, incl. concurrent P2002), [7] (retry → new attempt), [9] (permanent → DEAD_LETTERED), [15] (classification); `lifecycle.test.ts`, `idempotency.test.ts`.
- **Status: PROVEN** (in-scope parts; reversibility N/A).

### AU-7 — Strict org isolation; scheduled fan-out is per-org
- **Statement:** No cross-org reads or writes; scheduling seeds only single-org jobs.
- **Implementation:** every read is org-scoped (`getJob` L263, `listJobExecutions` L267, `sourceExistsInOrg` L312, `fetchAutomationHealth` L283 — all filter `organizationId`); `requeueDeadLetteredJob` filters org (L244, throws if absent); the scheduler enumerates org **ids only** then seeds per org (`scheduler.ts` L45–55); the proof observer reads org-scoped (`proof-observer.ts` L48).
- **Failure mode:** one org observing/mutating another's rows.
- **Test:** `e2e-automation.mjs` [3] (cross-org same identity → separate jobs), [11] (org B cannot read/requeue org A), [26] (cross-org source read refused → NO_ACTION), [31] (a fresh org's health sees none of another's).
- **Status: PROVEN.**

### AU-8 — Immutable operational ledger complements (never replaces) ActivityLog
- **Statement:** `AutomationExecution` is append-only and complements the `ActivityLog` business ledger; automation never rewrites ActivityLog.
- **Implementation:** insert-only `finalizeJob` (single `create`, `job-service.ts` L192; no update/delete path); ActivityLog linkage is **one-way** `ActivityLog.automationExecutionId → execution` (schema L1764; `activity.ts` writes a **new** row, never mutates an execution); operational mechanics are never logged to ActivityLog (only `observationSummary` triggers a write, `executor.ts` L70).
- **Failure mode:** an execution row edited after write; queue/retry noise polluting the business ledger.
- **Test:** `e2e-automation.mjs` [7] (prior attempt unchanged after retry), [22] (a no-observation job writes **no** ActivityLog row but still records its execution).
- **Status: PROVEN.**

### AU-9 — AI advisory, five-stamped, schema-validated, never a calc input
- **Statement:** AI outputs are advisory, fully version-stamped, never an underwriting calculation input or authoritative fact; model input untrusted.
- **Implementation:** **RESERVED — no AI in Phase 2.0.1.** The corollary "never a calculation input" holds trivially: there are no AI outputs, and `lib/analysis.ts` (the underwriting kernel) is **unchanged** vs `main`.
- **Failure mode (future):** an AI output feeding underwriting, or shipping unstamped/unvalidated.
- **Test:** AI/provider/network dependency scan = none; `git diff main -- lib/analysis.ts` = empty (Acceptance §Test Evidence).
- **Status: RESERVED** (no AI; the FC-0 "never a calc input" wall is satisfied by absence + unchanged kernel).

### AU-10 — Prefer transactional events over polling; reconciliation sweep only as backstop
- **Statement:** Prefer domain events; keep a reconciliation sweep as a bounded safety net, only once a scheduler is deliberately introduced.
- **Implementation:** **DEFERRED to Phase 2.0.2** — 2.0.1 deliberately introduces the **scheduler** (`scheduler.ts`) as the trigger; the transactional-outbox event path is not built (avoids touching frozen V1.x transactions). The `AutomationTriggerType` enum reserves `DOMAIN_EVENT` for that phase.
- **Failure mode (future):** relying on the best-effort `ActivityLog` as an event bus.
- **Test:** n/a (deferred); [17] proves the schedule path that 2.0.1 does ship.
- **Status: DEFERRED** (schedule-triggered by design; outbox → 2.0.2, recorded as D17).

### AU-11 — No external communication without explicit policy + audit
- **Statement:** No external comms without an org policy and full audit; drafts default to human review.
- **Implementation:** **PROVEN by absence** — there is **no** communication path in Phase 2.0.1 (no email/SMS/webhook send, no network egress anywhere in `lib/automation`, `app/api/automation`, or the runtime).
- **Failure mode:** any outbound message from an automation.
- **Test:** AI/provider/**network** scan (no `fetch`/`axios`/`http.request`/external URL) = none (Acceptance §Test Evidence).
- **Status: PROVEN** (no comms path exists).

### AU-12 — Frozen V1.3/V1.4 baselines untouched; only reads decided/LOCKED underwriting
- **Statement:** Frozen locks, engines, lifecycles, immutable snapshots, and the composed PAID gate are untouched; automation reads only decided/LOCKED underwriting outputs.
- **Implementation:** `lib/analysis.ts` **unchanged**; the proof job reads only the shared **Closing** projection (`projectClosingBadges`, `proof-observer.ts` L63), never underwriting; frozen refs `v1.3.0`/`v1.4.0`/`release/1.3`/`release/1.4` unmoved.
- **Failure mode:** a change to the kernel/frozen refs, or automation reading un-LOCKED underwriting.
- **Test:** `git diff main -- lib/analysis.ts` empty; `git ls-remote` frozen tips unchanged (Acceptance §Production Safety).
- **Status: PROVEN.**

### AU-13 — Health is a read projection; no second write path
- **Statement:** Automation health is derived from `AutomationExecution` + the queue; no second write path; its signals are advisory.
- **Implementation:** `health.ts` `projectHealth` is **pure** (no Prisma/clock; asserted non-mutating); `fetchAutomationHealth` (`job-service.ts` L283) only reads; the route is `GET`-only (`app/api/automation/health/route.ts`).
- **Failure mode:** health computation writing state, or mutating its inputs.
- **Test:** `health.test.ts` (incl. "projectHealth does not mutate inputs"); `e2e-automation.mjs` [31] (org-scoped read).
- **Status: PROVEN.**

---

## Part 3 — Mandatory proof areas

### 3.1 Source-of-truth protection
| Claim | Evidence |
|---|---|
| Automation owns no authoritative business state | AU-1; `perform()` returns `producedDomainEffect:false` (`proof-observer.ts` L120); [29] byte-for-byte no domain change |
| Proof job **consumes** the existing Closing projection | `proof-observer.ts` L63 `projectClosingBadges({...})` from `lib/transaction-dashboard.ts`; [25] "observation IS the shared projection" |
| Closing readiness/blocker logic **not duplicated** | no readiness/blocker arithmetic in `lib/automation/**`; the summary comes solely from `projectClosingBadges`/`isClosingRelevantStage` (imported, `proof-observer.ts` L14–16) |
| No underwriting calculation modified | `git diff main -- lib/analysis.ts` empty (AU-12) |
| `lib/analysis.ts` unchanged | same as above |
| No AI outputs exist | AI/provider scan none (AU-9) |

### 3.2 Governance
| Claim | Evidence |
|---|---|
| Every execution path passes through policy | `executor.ts` L59 before L60; [14] |
| No alternate executor path bypasses policy | `runClaimedJob` (L53) is the only handler-invoking path; `runExecutorOnce` (L106) dead-letters unknown types **without** running a handler (L114–125) |
| `REQUIRE_APPROVAL` cannot execute in 2.0.1 | reserved in the decision union (`types.ts` L34); proof policy never returns it; only `ALLOW` reaches `perform()` |
| Domain authorization remains independent | human RBAC unchanged; automation acts as its own principal, not via user RBAC — `AUTOMATION` resource is ADMIN-only **operator** visibility (`permissions.ts` L98), separate from the automation runtime |
| Automation Principal never impersonates a User | AU-3; `actorId:null` (`activity.ts` L37) |

### 3.3 Two-ledger architecture
| Claim | Evidence |
|---|---|
| `AutomationJob` owns mutable queue/lifecycle | `model AutomationJob` (schema L1863); status transitions in `lifecycle.ts` |
| `AutomationExecution` records immutable attempts | insert-only `finalizeJob` (`job-service.ts` L192); no update/delete API |
| Retries create new attempts | [7]: attempt 2 is a **new** row; `@@unique([automationJobId, attemptNumber])` (schema L1944) |
| Completed attempts not overwritten | [7] asserts attempt 1 is byte-for-byte unchanged after a retry + success |
| `ActivityLog` remains the business ledger | additive-only change (`actorType` default `USER`, nullable `automationExecutionId`); [20] backward-compat |
| Operational mechanics don't pollute ActivityLog | [22]: a no-observation job writes 0 ActivityLog rows; only `observationSummary` writes (`executor.ts` L70) |
| Automation attribution links to the execution | one-way `ActivityLog.automationExecutionId → execution` (schema L1764); [19] |

### 3.4 Organization isolation
| Claim | Evidence |
|---|---|
| Every job org-scoped | `organizationId NOT NULL` (migration); all reads filter org |
| Every execution org-scoped | same; `automation_executions.organizationId` FK CASCADE |
| Source references validated within org | `sourceExistsInOrg` (`job-service.ts` L312) fail-closed; proof `findFirst({id, organizationId})` (L48) |
| Cross-org execution fails closed | [26]: org B's job over org A's opp → `targetPresent:false` → NO_ACTION |
| Cross-org ActivityLog linkage fails closed | `activity.ts` L31 returns null on org mismatch; [21] |
| Health org-scoped / operator-scoped | `fetchAutomationHealth` filters org (L283); route ADMIN-only; [31] |
| E2E proves isolation | [3], [11], [26], [31] |

### 3.5 Idempotency & concurrency
| Claim | Evidence |
|---|---|
| Logical identity uses the approved compound key | `@@unique([organizationId, automationType, sourceType, sourceId, policyVersion, occurrenceKey])` (schema L1895) |
| Duplicate enqueue converges | [1] sequential, [2] concurrent (P2002 → re-read winner, `job-service.ts` L86) |
| Two executors can't execute the same leased job | `SELECT … FOR UPDATE SKIP LOCKED` (`job-service.ts` L122); [6] exactly one concurrent claim wins |
| One job can't have two simultaneous active attempts | claim flips QUEUED→RUNNING with lease (L126–134); [5] a RUNNING job is not re-claimed |
| Retry attempts preserve prior history | [7]; attempt-uniqueness (L1944) |
| Stale leases recover safely | reaper (`reaper.ts` L15); [16] |
| Reaper is idempotent | [16] "a second reaper pass is a no-op"; attempt-uniqueness prevents double-record (`reaper.ts` L34) |

### 3.6 Failure handling
| Claim | Evidence |
|---|---|
| Failures classified | `classifyError` (`executor.ts` L43); `AutomationFailureClass` enum (schema L1830) |
| Retryable vs permanent differ | `failureDisposition` (`lifecycle.ts` L81); [15] transient→retry, validation→dead-letter, org-scope→classified |
| Exponential backoff deterministic | `backoffMs` = `base·2^(n-1)` capped (`lifecycle.ts` L100); `lifecycle.test.ts` |
| Retry exhaustion dead-letters | `nextStatusAfterFailure` (L89); [9] |
| Stale context doesn't execute | policy STALE_CONTEXT (`policy.ts` L47); [27]; perform never reached |
| Errors sanitized | `sanitizeError` redacts conn-strings/secrets, truncates (`idempotency.ts` L62); `idempotency.test.ts` |
| Operator replay preserves history | `requeueDeadLetteredJob` never touches executions (`job-service.ts` L239); [10] |

### 3.7 Read-only proof automation
All proven by `e2e-automation.mjs` [24]–[30] + `proof-observer.ts`:
consumes the shared projection (L63) · deterministic ([25] same fingerprint) · policy-gated ([25]/[27]) ·
org-scoped (L48) · `producedDomainEffect=false` (L120, [29]) · modifies no Opportunity/Closing-checklist/
Escrow/Financing/Assignment/Underwriting ([29] snapshot) · creates no task/document ([29]) · sends no
email/SMS (no comms path) · calls no AI (scan) · moves no stage · makes no PAID decision (read-only `perform`).

### 3.8 Production safety (verified checkpoint)
| Item | Verified value |
|---|---|
| Feature branch tip (local) | `ac9897c` (this doc adds one commit on top — see the acceptance package for the tip current at push) |
| Gitea (`origin`) tip | matched local at each push |
| GitHub (`github`) tip | matched local at each push |
| `main` unmoved | `1760c9a` |
| Frozen branches/tags unmoved | `release/1.3` `d341c0a` · `release/1.4` `ece38aa` · `v1.3.0` `bca39f4` · `v1.4.0` `c1133ad` |
| Production migrations | **26** (unchanged) |
| Migration 27 applied to prod | **No** (no `%automation%` migration row) |
| Prod Automation tables / ActivityLog columns | **absent** (`automation_jobs`/`automation_executions` = null; no `actorType`/`automationExecutionId`) |
| Prod executor running | **No** `crowdexpanse-automation` process |
| Prod web health | `GET /api/health` → `{"status":"ok"}` |

*(Tips are re-verified at each push; see [Implementation Acceptance](./V2_0_1_IMPLEMENTATION_ACCEPTANCE.md).)*

---

## Part 4 — Acceptance-criteria cross-reference (AC-1 … AC-31)

| AC | Evidence |
|---|---|
| **AC-1** org-scoped everywhere | §3.4; [11] |
| **AC-2** AUTOMATION principal, never a user | AU-3; [19] |
| **AC-3** execution insert-only | AU-8; [7] |
| **AC-4** idempotent job creation | AU-6; [1] |
| **AC-5** per-attempt uniqueness under concurrency | [5]/[6]/[8]; `@@unique` L1944 |
| **AC-6** transient → RETRY_SCHEDULED w/ backoff; not re-claimed early | `lifecycle.test.ts`; [7] |
| **AC-7** permanent/exhausted → DEAD_LETTERED w/ immutable failed attempts | [9]/[15] |
| **AC-8** policy stamped; no domain call on non-ALLOW | AU-4; [14] |
| **AC-9** separate layers; executor sole actor, policy-first | AU-2/A2; [12] |
| **AC-10** ≤1 attributed ActivityLog row/run; best-effort, failure-isolated | [19]/[22]; `activity.ts` best-effort `catch` (L46) |
| **AC-11** crash recovery via reaper (abandoned execution) | [16]; `reaper.ts` |
| **AC-12** no authoritative effect; `producedDomainEffect=false`; no domain row changed | AU-1; [29] |
| **AC-13** no external comms / AI / new provider / calc change | AU-9/AU-11; scans |
| **AC-14** owns no authoritative state | AU-1 |
| **AC-15** no underwriting calc altered/input | AU-9/AU-12; analysis.ts unchanged |
| **AC-16** no bypass of UNDERWRITING_APPROVAL / Closing / PAID | read-only; no stage/PAID path (§3.7) |
| **AC-17** mutates no snapshot; overwrites no ActivityLog | AU-8; [22] |
| **AC-18** no cross-org read/write; per-org fan-out | AU-7; [26]; scheduler L45–55 |
| **AC-19** principal never impersonates a user | AU-3; [19] |
| **AC-20** mandatory policy; no skip path | AU-4; [14] |
| **AC-21** two-ledger complement | AU-8; [22] |
| **AC-22** 4 pure modules in CRITICAL ≥90% branch; overall ≥80% | unit gate 93.0% overall; all critical ≥90% |
| **AC-23** e2e auto-discovered, `_test`-guarded, passes | `assertTestDatabase()` in `e2e-automation.mjs`; 39/39 suite |
| **AC-24** typecheck passes | `tsc --noEmit` 0 errors |
| **AC-25** migrate clean; 26→27 additive; D15 untouched | migration additive-only; test DB at 27; D15 not touched |
| **AC-26** exactly one AUTOMATION resource + MATRIX row + `canRequeueAutomationJob`; requeue ADMIN-only | `permissions.ts` L50/L98/L175; `permissions/can.test.ts` |
| **AC-27** additive ActivityLog change → zero behavior change | [20] backward-compat |
| **AC-28** PM2 process idle-safe; stopping doesn't affect web | `ecosystem.config.js` inert app + kill-switch; runtime `scheduler=off` path (`automation-runtime.mjs` L15) — *operational check at rollout* |
| **AC-29** health endpoint returns full counters incl. org-scope-violation count | `health.ts` `HealthSummary`; route; [31] |
| **AC-30** ADMIN requeue creates new attempt, never mutates prior executions | AU-6; [10] |
| **AC-31** `/api/health` unchanged; kill-switch disables scheduler without redeploy | `/api/health` untouched; `AUTOMATION_SCHEDULER_ENABLED` (`automation-runtime.mjs` L15) — *operational check at rollout* |

**No acceptance criterion is left without evidence.** AC-28 and AC-31 include an operational component verified during rollout (post-acceptance), in addition to the code shown here.

---

## Part 5 — Test evidence (inventory)

| Category | Evidence | Recorded total |
|---|---|---|
| Unit tests (pure modules) | `tests/unit/automation/{lifecycle,policy,idempotency,health}.test.ts` + `permissions/can.test.ts` (AUTOMATION) | unit gate **93.0% overall branch**, all critical ≥90% |
| Automation E2E assertions | `scripts/e2e-automation.mjs` sections [1]–[31] | **98 assertions**, 0 failed |
| Full E2E suite | `scripts/e2e-all.mjs` | **39 scripts passed** |
| Org-isolation tests | [3], [11], [26], [31] | (within the 98) |
| Concurrency tests | [2] (P2002), [6] (SKIP LOCKED) | (within the 98) |
| Crash/recovery tests | [16] (reaper) | (within the 98) |
| Migration validation | `prisma validate` valid; `migrate status` (test DB) **27**, no drift | — |
| Isolated build | `build:isolated` — route compiled, prod `.next` untouched | **passed** |
| Secret scan | branch diff | clean |
| AI / provider / network scan | `lib/automation`, `app/api/automation`, runtime | **none** |
| `lib/analysis.ts` unchanged | `git diff main` | empty |
| Production-safety checks | §3.8 | prod at 26 migrations, executor not running |
| Typecheck | `tsc --noEmit` | **zero errors** |

---

## Part 6 — Founder Review Questions

Decisions to consciously accept before merge and rollout. Presented neutrally — this document does **not** recommend acceptance.

1. **Database-backed queue instead of an external broker.** The queue is the `AutomationJob` table claimed with `FOR UPDATE SKIP LOCKED`. Accept this as the scaling ceiling for now (it is replaceable behind the `job-service` contract), or require a broker first?
2. **Dedicated PM2 executor as the first out-of-request process.** `crowdexpanse-automation` is the platform's first background process (new operational surface, adjacent to D4). Accept operating a second process?
3. **Polling/scheduling now; transactional outbox deferred to 2.0.2.** A6/AU-10 prefer events; 2.0.1 ships schedule-triggered to avoid touching frozen V1.x transactions. Accept the schedule-first sequencing?
4. **Policies as versioned code, not DB configuration.** `evaluatePolicy` is pure code with `POLICY_VERSION`. Accept code-defined policy for this phase (DB-configurable deferred)?
5. **No hard per-org concurrency cap yet.** Claims are batched (`CLAIM_BATCH=10`) but there is no per-org ceiling. Accept for the read-only phase?
6. **No forced cancellation of an active execution.** Graceful stop + lease/reaper recovery exist; there is no forced cancel of an in-flight attempt. Accept?
7. **One-way ActivityLog → execution linkage.** `execution.activityLogId` stays reserved/null to preserve ledger immutability; the link direction is ActivityLog → execution. Accept?
8. **Migration 27 additive ActivityLog attribution fields.** `actorType` (default `USER`) + nullable `automationExecutionId` on `activity_log`. Accept the additive change to a shared table?
9. **One registered automation — the harmless Closing-readiness observer.** The registry wires exactly one read-only automation. Accept the minimal-surface proof phase?
10. **Production rollout is separate, kill-switched, dark-start.** Acceptance authorizes rollout; the executor starts later, dark, behind `AUTOMATION_SCHEDULER_ENABLED`. Accept that acceptance ≠ automatic production start?

---

*End of Phase 2.0.1 Architecture Traceability Matrix — FOUNDER ACCEPTED (2026-07-16).*
