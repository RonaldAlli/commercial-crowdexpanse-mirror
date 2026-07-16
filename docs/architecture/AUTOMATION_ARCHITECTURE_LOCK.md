# Automation Architecture Lock (Version 2.0)

> **Status: PENDING FOUNDER RATIFICATION — conceptual architecture only.** No
> implementation, no schema, no migration, no production change. This lock defines the
> **Automation** domain's responsibilities, ownership boundaries, layering, and invariants
> so that — when ratified and built slice by slice — automation extends the platform through
> its established seams and **never becomes a competing source of truth or bypasses human
> governance.** Companions: [Version 2.0 Discovery](./VERSION_2_0_DISCOVERY.md),
> [Version 2.0 Decision Package](./VERSION_2_0_DECISION_PACKAGE.md),
> [Platform Architecture Map](./PLATFORM_ARCHITECTURE_MAP.md).
>
> **Frozen baselines untouched:** V1.3 (`v1.3.0`) and V1.4 (`v1.4.0`) — their locks, engines,
> lifecycles, immutable snapshots, and the composed PAID gate are not modified by anything here.

---

## 0. Scope & the one rule

Automation is a **first-class, bounded orchestration domain** (A1). It **observes** existing
projections and events, **evaluates policy**, **orchestrates existing domain services** through
the same human-approval seams a person uses, and **records its own execution** in an immutable
operational ledger. It owns **orchestration only**.

> **The one rule:** *Automation owns no authoritative business truth.* It never owns
> underwriting, closing state, calculations, approvals, or any domain's source of truth.
> Everything below is a corollary.

---

## 1. Automation as a bounded domain (A1)

The domain is composed of six conceptual entities (models named for clarity; **conceptual — no
schema is proposed here**):

| Entity | Owns | Never owns |
|---|---|---|
| **AutomationPolicy** | The declarative rule for a capability: trigger condition, target selector, category (DA/HA/AI/GD), guardrails, org scope, `policyVersion` | Any business decision; it *evaluates*, it does not *decide* domain outcomes |
| **AutomationJob** | A unit of work = a policy instantiated for a target; carries the **idempotency anchor** `(organizationId, jobKind, requestKey)` and queue/lifecycle status | The effect itself; it *requests* work, the executor performs it after policy+RBAC |
| **AutomationExecution** | The **immutable** record of one run (A8) — the operational audit ledger | Business truth (that stays in `ActivityLog` + the domains) |
| **AutomationProposal** | An advisory output in a state machine (`PROPOSED → ACCEPTED / REJECTED / SUPERSEDED / EXPIRED`) awaiting a human decision | The committed effect; a human/ratified-policy commits it through the real seam |
| **AutomationAction** | A *requested* effect, expressed as a call to an **existing domain service**, gated by policy + RBAC | The domain's state; it delegates to `escrow-service`/`closing-service`/etc., never writes their tables |
| **AutomationResult** | The outcome of an action/execution (success, `permanent`/transient failure classification, resulting `ActivityLog` refs) | — |

**Ownership boundary (AU-1):** Automation may create/read/update **only** its own
policy/job/execution/proposal/action/result records. It **never** owns or directly mutates
Underwriting, Closing, Escrow, Financing, Assignment, Opportunity, Documents, or Intelligence
truth. It *reads* their projections and *calls* their services.

---

## 2. Scheduling ↔ execution separation (A2)

Five **independently replaceable** layers; a scheduled job **never** invokes a domain mutation
directly:

```
   SCHEDULER            when / how often a policy fires (or an event triggers it)
       │  enqueues an AutomationJob (idempotent)
       ▼
   JOB QUEUE            durable, org-scoped work list; ordering + backpressure + retry
       │  the executor claims a job
       ▼
   EXECUTOR             runs one job → opens an AutomationExecution (write-ahead)
       │
       ▼
   POLICY ENGINE        Projection → Policy Evaluation → RBAC  (MUST pass, A4)
       │  only if permitted
       ▼
   EXISTING DOMAIN SVC  the real, already-authorized service (escrow-service, closing-service, …)
       │
       ▼
   ActivityLog          business audit  (+ AutomationExecution closes: result, duration, retries)
```

**AU-2:** the scheduler decides *when*, the executor decides *how a single job runs*, the policy
engine decides *whether it may*, and the domain service decides *what actually changes*. None may
be collapsed into another. A worker that "just writes the row" is prohibited — every effect goes
through the domain service + its seam.

---

## 3. Automation Principal (A3)

Every action carries an explicit principal. A first-class `PrincipalType`:

| Principal | Meaning | Identity rules |
|---|---|---|
| **USER** | A human actor | The signed-in user |
| **SYSTEM** | Platform-internal maintenance (e.g. migrations, backfills) | No org-scoped business effect |
| **AUTOMATION** | An automation policy acting on a schedule/event | Inherits **org context only**; **never** a user identity |
| **WEBHOOK** | An inbound external trigger (e.g. a provider callback) | Verified source; org-scoped; never a user |

**AU-3:** Automation **never impersonates a user.** Every automated `ActivityLog` and
`AutomationExecution` row is attributed to the `AUTOMATION` (or `WEBHOOK`) principal with the
originating `policyId`. A worker inherits **organization context** but **never** a user's
identity or permissions — unless it is explicitly executing an **approved workflow** a specific
user committed (in which case that user is the accepting actor and automation is the mechanism,
both recorded).

---

## 4. Mandatory policy layer (A4)

Every automated action passes, in order:

```
   PROJECTION  →  POLICY EVALUATION  →  RBAC  →  EXECUTION  →  ActivityLog
   (read truth)   (should it happen?)   (may this   (domain      (business
                                          principal   service)     audit)
                                          do it?)
```

**AU-4:** No worker bypasses the policy layer, and policy never bypasses the existing approval
seams. RBAC is evaluated with the **Automation Principal's** capabilities via the *same*
`lib/permissions.ts` predicates (`can`, `canResolve*`, `canWaiveClosingItem`,
`canExecuteAssignment`, `canMoveStage`) and `UNDERWRITING_APPROVAL`. A **Prohibited Autonomous
Action** (stage moves, checklist completion/waiver, Escrow/Financing/Assignment/Underwriting/PAID
decisions) can only ever exist as an **AutomationProposal** a human commits — and only if a future
approval mechanism is explicitly ratified.

---

## 5. AI versioning model (A5)

Every AI interaction is **reproducible and auditable** via five version stamps (mirroring
`IntelligenceSignal`'s existing four-version precedent):

| Stamp | Identifies |
|---|---|
| **promptVersion** | The exact prompt/template used |
| **modelVersion** | The model + provider (behind the AI provider abstraction, `EmailTransport`-shaped) |
| **schemaVersion** | The structured-output schema the response was validated against |
| **policyVersion** | The AutomationPolicy that invoked the AI |
| **evaluationVersion** | The eval suite/threshold the capability passed before shipping |

**AU-9:** AI outputs are **advisory**, carry all five stamps + provenance, are produced against a
**validated structured-output schema** (retry on mismatch), and are **prohibited from being an
underwriting calculation input** (FC-0 wall) or an authoritative fact. Model input is treated as
**untrusted** (prompt-injection posture); AI tool-use never mutates state except through a
human-gated seam.

---

## 6. Event-driven preference (A6)

**Determination (evidence-based):** prefer **domain events over polling**, using a
**transactional-outbox** pattern — which the platform already demonstrates (the email outbox
writes an intent row in the same transaction, then a drain acts on it). A low-frequency
**reconciliation sweep** remains a bounded backstop, because `ActivityLog` is **best-effort**
(TL-2) and therefore **not** a reliable event bus on its own.

```
   Closing deadline changes (domain write)
        │  emit a domain event in the SAME transaction (transactional outbox)
        ▼
   Deadline event  ──▶  Scheduler enqueues a Reminder AutomationJob (idempotent)
        ▼
   Executor → Policy → (delivery policy) → Reminder surfaced/sent
        ▼
   AutomationExecution (operational) + ActivityLog (business)
```

**AU-10:** prefer transactional domain events; avoid unnecessary polling; keep a periodic
reconciliation sweep only as a safety net (never as the primary mechanism), and only once a
scheduler is deliberately introduced (no cron is installed today — D4). This keeps automation
reactive and cheap without depending on a best-effort log for correctness.

---

## 7. Immutable AutomationExecution ledger (A8 — the primary addition)

Two complementary ledgers, never one replacing the other:

- **`ActivityLog`** — the **business** activity ledger (what happened to a deal). Unchanged;
  best-effort; append-only in practice; automation writes to it via the domain services with the
  Automation Principal, and **never rewrites** it.
- **`AutomationExecution`** — the **operational** audit ledger (what automation did, and how
  well). **Immutable / append-only.**

Each `AutomationExecution` conceptually captures:

`executionId` · `organizationId` · `policyId` + `policyVersion` (policy evaluated) ·
`triggeringEvent` (event or schedule) · `triggeringProjectionVersion` (the read-state basis) ·
`startedAt` / `finishedAt` (timestamp + duration) · `result` (success/failed/skipped) ·
`retryCount` · `failureClassification` (transient / permanent) · `resultingActivityLogIds[]`
(the business rows it produced) · `principal` (AUTOMATION / WEBHOOK).

**AU-8:** `AutomationExecution` is the operational source of truth for *automation behavior*;
`ActivityLog` remains the source of truth for *business activity*. They **complement**, not
replace, each other. `triggeringProjectionVersion` ties each run to the exact read-state it acted
on (reproducibility). The ledger is never edited or deleted.

---

## 8. Automation health & operations (A7)

The **Automation Operations** model — the operational dashboard for Version 2.x — is a **read
projection over `AutomationExecution` + the job queue** (TX-6 Projection Reuse discipline; it
recomputes nothing). First-class metrics:

- queued jobs · running jobs · retries · **dead-letters** (terminal `FAILED`) · failures ·
  execution latency (from `startedAt`/`finishedAt`) · **policy violations** (attempts the policy
  layer blocked).

**AU-13:** automation observability is derived, not a second write path; alerts on dead-letters /
policy-violations / latency are advisory operational signals (they are not business truth).

---

## 9. Locked invariants (AU-1 … AU-13)

- **AU-1** Automation owns only its own policy/job/execution/proposal/action/result records —
  never business truth, underwriting, closing state, calculations, or approvals.
- **AU-2** Scheduler → Queue → Executor → Policy Engine → Domain Service → ActivityLog are
  independently replaceable; a scheduled job never invokes a domain mutation directly.
- **AU-3** Automation Principal (USER/SYSTEM/AUTOMATION/WEBHOOK); automation never impersonates a
  user; org context inherited, user identity never inherited except under an explicitly approved
  workflow; every automated action explicitly attributed.
- **AU-4** Every automated action passes Projection → Policy → RBAC → Execution → ActivityLog; no
  bypass of policy or of the existing approval seams.
- **AU-5** Advisory-until-accepted: outputs are `AutomationProposal`s (`PROPOSED→ACCEPTED/
  REJECTED/SUPERSEDED/EXPIRED`); effects only on human accept via the real seam (or an explicitly
  ratified policy for advisory notifications).
- **AU-6** Idempotency `(organizationId, jobKind, requestKey)`; retries via RetryPolicy +
  transient/permanent classification; terminal `FAILED` = dead-letter; reversibility only via the
  domain's own lifecycle (never raw delete / snapshot overwrite).
- **AU-7** Strict org isolation; no cross-org reads or writes; scheduled fan-out is per org.
- **AU-8** `AutomationExecution` is an immutable operational ledger complementing (never
  replacing) the `ActivityLog` business ledger; automation never rewrites `ActivityLog`.
- **AU-9** AI outputs advisory, five-version stamped (prompt/model/schema/policy/evaluation),
  schema-validated, evaluated before ship, never a calculation input, never authoritative; model
  input untrusted.
- **AU-10** Prefer transactional domain events over polling; reconciliation sweep only as a
  bounded backstop (ActivityLog is best-effort, not a reliable bus).
- **AU-11** No external communication without an explicit org policy + full audit trail; drafts
  default to human review.
- **AU-12** Frozen V1.3/V1.4 baselines, locks, engines, lifecycles, immutable snapshots, and the
  composed PAID gate are untouched; automation only reads decided/LOCKED underwriting outputs.
- **AU-13** Automation health is a read projection over `AutomationExecution` + the queue; no
  second write path; its signals are advisory, not business truth.

---

## 10. Standing constraints (verbatim)

Automation must **never**: own authoritative business state · alter underwriting calculations ·
become an underwriting calculation input · bypass `UNDERWRITING_APPROVAL` · bypass Closing
readiness policy · bypass the composed PAID gate · mutate immutable snapshots · overwrite
`ActivityLog` history · perform cross-organization reads or writes · send external communications
outside explicit policy · treat AI output as authoritative fact.

---

## 11. Relationship to the phased roadmap

This lock is realized incrementally by the [Version 2.0 roadmap](./VERSION_2_0_DECISION_PACKAGE.md#3-proposed-phased-roadmap-smallest-safe-foundation-first):
**Phase 2.0.1** establishes the domain spine (Automation Principal + Policy layer + Job +
immutable `AutomationExecution` ledger + the layer separation) with **no AI and no external
send**; later phases add deterministic reminders, the proposal workflow, policy-gated delivery,
advisory AI (with the A5 versioning), generated drafts, and evaluation/monitoring (the A7 ops
model). Each phase is separately ratified. **No implementation begins until Phase 2.0.1 is
ratified.**
