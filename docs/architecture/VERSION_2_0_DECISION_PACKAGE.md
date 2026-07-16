# Version 2.0 (Automation & AI) — Architecture Decision Package

> **Status: PENDING FOUNDER RATIFICATION.** Architecture determination only. **No
> implementation code; no change to any frozen 1.3/1.4 branch, lock, boundary, engine,
> lifecycle, PAID gate, or production state.** Grounded in the [Version 2.0 Discovery
> Report](./VERSION_2_0_DISCOVERY.md) and the [Platform Architecture Map](./PLATFORM_ARCHITECTURE_MAP.md).
> The single deliverable of this turn is documentation; **implementation stops here** until
> a first slice is ratified.

---

## 0. Mission & the one rule everything serves

Add Automation & AI to CrowdExpanse **without letting automation become a competing source
of truth or bypass human governance.** Every decision below is a corollary of that rule.

Three tiers, from the discovery evidence:

```
   DETERMINISTIC AUTOMATION   →   HUMAN-APPROVED AUTOMATION   →   ADVISORY AI / GENERATED DRAFTS
   (pure derivations over        (a real effect, but only        (provenance-stamped, versioned,
    existing data → advisory      after an explicit human          reviewed; NEVER authoritative,
    notifications; safe to run)   approval seam fires)             NEVER a calculation input)
                                        ▲
                        the existing can*/UNDERWRITING_APPROVAL/PAID seams —
                                  automation invents no bypass
```

---

## 1. Core architectural determinations

### D1 — Deterministic automation before AI. **(Evidence-based.)**
The safe substrate already exists (idempotent jobs, write-ahead delivery, pure projections,
approval seams); AI is greenfield and needs new scaffolding. Build the deterministic
foundation first; introduce AI only once the foundation's audit/idempotency/approval seams are
proven. *(Discovery §1, §5, §10, §11.)*

### D2 — Actions that may be automated **without** human approval.
Only **advisory, non-mutating outputs**: deterministic **notifications, reminders, alerts, and
summaries** derived from data that already exists. They change **no** operational state; they
point a human at a decision. (Even here: *external delivery* of such a notification is a
separate, policy-gated step — see D6.)

### D3 — Actions that require human review / explicit approval.
Anything that **creates or changes operational state** — creating a task, sending an external
message, accepting an AI suggestion into a domain, or any Escrow/Financing/Assignment/
Underwriting/PAID/stage/checklist effect. These flow **only** through the existing seams
(`can*` predicates, `UNDERWRITING_APPROVAL`, composed PAID gate). Automation may *prepare* a
proposal; a human (or an explicitly ratified policy) *commits* it.

### D4 — Automation owns **nothing** authoritative. It **orchestrates + proposes**.
Modeled on `RefreshJob` (observational) and `IntelligenceSignal` (propose → human-accept):
automation may own its **own execution / audit / proposal** records, but never a domain's
truth. It calls existing domain services to effect change; it never writes a domain table
behind their back.

### D5 — Automation consumes projections + ActivityLog; it never duplicates operational truth.
Reminders/alerts derive from the **same** pure projections the UI uses
(`lib/transaction-dashboard.ts`, `lib/closing.ts`) — TX-6 Projection Reuse. ActivityLog is a
**trigger/observation** source only, understood as best-effort (TL-2), never a correctness ledger
and never rewritten.

### D6 — Recommendations, drafts, reminders, alerts stay **advisory until accepted**.
An AI/automation output is a **proposal in a state machine** (`PROPOSED → ACCEPTED | REJECTED |
SUPERSEDED | EXPIRED`), mirroring the intelligence signal lifecycle. It becomes an effect only
when a human accepts it through the relevant seam. **External communications** additionally
require an **explicit org policy + full audit trail** before any send (Discovery §3/§9/§12).

### D7 — Every automated action is attributed, audited, idempotent, retryable, reversible-where-safe.
Reuse the existing machinery: an **automation principal** (a distinct actor identity) stamps
`ActivityLog`; an idempotency anchor `(organizationId, jobKind, requestKey)` (mirroring
`RefreshJob`) dedups; a **write-ahead job/outbox ledger** (mirroring the email outbox) makes
partial execution and duplicate delivery safe; `RetryPolicy` + `permanent`-flag classification
governs retries; reversibility uses the domain's **own** lifecycle (e.g. `reopen`), never a raw
delete or snapshot overwrite.

### D8 — Org isolation & RBAC apply to workers and scheduled jobs.
A worker runs **within a single org scope** under an explicit automation policy; its real
effects are gated by the same `can*` predicates as a human. **No cross-org reads or writes** —
ever. Scheduled jobs fan out **per org**, each independently scoped and audited.

### D9 — Provider failures / partial execution / duplicate delivery / stale context.
Reuse the outbox discipline: **write the intent row before calling the provider**; advance to a
terminal state after; **reconstruct payloads fresh from the source of truth at send time** (no
stale replay); dedup by idempotency key (no duplicate delivery); classify errors
transient-vs-permanent; the terminal `FAILED` state is the dead-letter; deterministic replay
where the operation is pure.

### D10 — Model outputs are versioned, evaluated, constrained, and walled off from calculations.
Every AI output carries provenance + **version stamps** (`modelId`, `promptVersion`,
`schemaVersion`, mirroring `IntelligenceSignal`'s four version fields), is produced against a
**structured-output schema** (validated, retried on mismatch), is scored by an **evaluation
harness** before a capability ships, and is **prohibited from being an underwriting calculation
input** (FC-0 boundary) or an authoritative fact. AI is introduced behind a **new provider
abstraction** shaped like `EmailTransport`.

---

## 2. Capability–permission matrix

Five categories (as ratified in the mission):
**DA** = Deterministic automation · **HA** = Human-approved automation · **AI** = Advisory AI ·
**GD** = Generated draft/content · **PA** = Prohibited autonomous action.

| Candidate capability | Category | Why / governing seam |
|---|---|---|
| Closing deadline reminders | **DA** | Pure derivation over `ClosingChecklistItem.dueDate` / `targetCloseDate` (Discovery §7); advisory notification only |
| Overdue-item alerts | **DA** | `blockingItems` + overdue detection already projected; advisory |
| Responsible-party notifications | **DA** | `ownerId` / `responsibleParties` already projected; advisory (in-app first) |
| Daily transaction summaries | **DA** | Roll-up of existing projections; advisory digest |
| Seller follow-up reminders | **DA** | Derived from seller/opportunity timestamps; advisory |
| Buyer-match notifications | **DA** | `BUYER_MATCH` events already exist; advisory notification |
| Document checklist suggestions | **AI** | Advisory suggestion; a human adds items via `CLOSING`; never auto-adds |
| Draft emails | **GD** | Reuses generated-content framing; **send** is HA + external-comms policy (D6) |
| Draft SMS | **GD** | Same as draft email **+ requires a new SMS provider** (greenfield, Discovery §3) |
| Draft task creation | **GD → HA** | Proposed task; **creating** it is HA via `TASK` on human accept |
| Underwriting narrative summaries | **AI** | Advisory text over frozen underwriting outputs; read-only; never a calc input (D10) |
| Risk explanations | **AI** | Advisory; explains existing findings; not authoritative |
| Deal-priority recommendations | **AI** | Advisory ranking; a human acts through normal seams |
| Suggested next actions | **AI** | Advisory; each suggestion links to a human-gated action |
| Data-enrichment recommendations | **AI → HA** | Advisory; acceptance is the existing high-risk `OWNER_IDENTITY`/`PROPERTY_IDENTITY`/signal seam |
| AI-assisted document review | **AI** | Advisory findings on a document; a human decides |
| Automated stage movement | **PA** | Bypasses `canMoveStage` / composed PAID gate — prohibited |
| Automated checklist completion/waiver | **PA** | Bypasses `CLOSING` / ADMIN `canWaiveClosingItem` — prohibited |
| Automated Escrow/Financing/Assignment decisions | **PA** | Bypass ADMIN `canResolve*/canExecuteAssignment` + immutable snapshots — prohibited |
| Automated Underwriting/PAID decisions | **PA** | Bypass `UNDERWRITING_APPROVAL` / composed PAID gate — prohibited |

> A **PA** capability is not "not yet built" — it is **forbidden as an autonomous action**. It
> may only ever exist as a *proposal* a human commits through the real seam, and only if a
> future approval mechanism is **explicitly ratified**.

---

## 3. Proposed phased roadmap (smallest safe foundation first)

Confirmed from repository evidence (Discovery §1/§10 give the foundation; §5/§7 give
deterministic reminders; §4 gives approval; §8/§11 give AI). Each phase is separately ratified,
implemented on a feature branch, gated, and released — the V1.3/V1.4 cadence.

| Phase | Name | What it establishes | Rides on |
|---|---|---|---|
| **2.0.1** | **Automation Foundation + Job Execution & Audit** | An org-scoped, idempotent, attributed, retryable **job substrate** with a single audit surface + an **automation principal**; **no AI, no external send** | `RefreshJob` + outbox patterns (§1/§10); `lib/authorize.ts` (§4) |
| **2.0.2** | **Deterministic Reminders & Alerts** | Pure-projection reminders/overdue/summaries surfaced **in-app** (reuse the ActivityLog-derived notification cursor) | Phase 1 substrate + existing projections (§5/§7/§12) |
| **2.0.3** | **Human-Approval / Proposal Workflow** | A first-class **proposal** record + state machine (`PROPOSED→ACCEPTED/REJECTED/…`) so any capability can *propose* and a human *commits* through existing seams | `IntelligenceSignal` state model (§8) + `can*` seams (§4) |
| **2.0.4** | **Outbound Delivery (policy-gated)** | External delivery of notifications/reminders via the email outbox under an **explicit org policy + audit**; SMS only if a provider is added | Email outbox (§3); D6 policy |
| **2.0.5** | **Advisory AI (provider + provenance + guardrails)** | A **new AI provider abstraction**, structured-output schemas, versioned prompts, a provenance/state/version model for outputs; first advisory capability (e.g. underwriting narrative summary) | Phase 3 proposal model; `EmailTransport`-shaped provider (§9/§11); `IntelligenceSignal` versioning (§8) |
| **2.0.6** | **Generated Drafts** | AI-drafted emails/tasks as **proposals** a human reviews → commits via Phase 3/4 | Generated-doc framework (§3); Phases 3–5 |
| **2.0.7** | **Evaluation & Monitoring** | Offline eval harness + online monitoring for AI quality, drift, cost, and guardrail adherence | Phase 5 outputs |

**Sequencing rationale:** value and safety both accrue earliest from deterministic reminders
(Phases 1–2) that need *no* AI and *no* external send; the proposal + policy machinery (Phases
3–4) is the governance spine every later capability reuses; AI (Phases 5–7) lands last, on a
proven, audited, human-gated foundation — exactly the "clean baseline for AI" the closeout
called for. **The order is confirmed by evidence, not assumed.**

---

## 4. Risk register

| # | Risk | Likelihood | Impact | Mitigation (design-level) |
|---|---|---|---|---|
| R1 | Automation becomes a shadow source of truth | Med | **Critical** | D4/D5: automation owns only proposal/audit records; consumes projections; commits via domain services |
| R2 | An automated action bypasses a human seam (waiver, resolve, PAID) | Low | **Critical** | D3/D8: real effects gated by the same `can*` predicates; PA capabilities forbidden; enforced in `lib/authorize.ts` |
| R3 | AI output treated as fact / leaks into a calculation | Med | **Critical** | D10: advisory-only, provenance+version stamped, structured-schema, FC-0 wall; underwriting engine untouched |
| R4 | Duplicate external delivery (double email/SMS) | Med | High | D7/D9: idempotency anchor + write-ahead ledger; reuse outbox dedup |
| R5 | Cross-org leak by a worker/scheduled job | Low | **Critical** | D8: per-org scoping; no cross-org reads/writes; org-scoped queries + cross-org E2E (mitigates D2 debt) |
| R6 | Stale context (job acts on outdated state) | Med | High | D9: reconstruct payload fresh from source at execution time (outbox pattern) |
| R7 | Provider failure / partial execution corrupts state | Med | High | D9: write-ahead intent row → terminal state; transient/permanent classification; FAILED dead-letter |
| R8 | Prompt injection / adversarial content via documents or fields | Med | High | D10: structured output + schema validation; treat model input as untrusted; no tool-use that mutates state without a human seam |
| R9 | External comms sent without consent/policy | Low | High | D6: no send without explicit org policy + audit; drafts default to review |
| R10 | Runaway/looping jobs or cost blowout | Med | Med | Phase-1 job substrate caps concurrency/attempts (RetryPolicy + max-attempts); Phase-7 monitoring on cost |
| R11 | Silent alteration of historical ActivityLog | Low | High | D5: ActivityLog is append-only in practice; automation never updates/deletes rows |
| R12 | Model/prompt drift degrades quality unnoticed | Med | Med | D10 + Phase-7: versioned prompts + eval harness + online monitoring; a capability ships only past an eval bar |
| R13 | Scope creep past a ratified phase | Med | Med | One-phase-at-a-time ratification gate; PA line is explicit; this package is the reference |

---

## 5. Recommended first implementation slice

**Phase 2.0.1 — Automation Foundation + Job Execution & Audit.** The smallest safe foundation,
with **no AI and no external send**, that everything else rides on:

- An **automation principal** (a distinct, non-human actor identity) so every automated action
  is attributable in `ActivityLog` and gated by RBAC like any actor.
- A minimal, org-scoped **job/execution substrate** modeled on `RefreshJob`: an idempotency
  anchor `(organizationId, jobKind, requestKey)`, `status` lifecycle, `startedAt/finishedAt`,
  `error`, and a **single audit surface** (the job row itself + `ActivityLog`), with
  `RetryPolicy`/`permanent`-style classification borrowed from the outbox.
- **No scheduler commitment yet** beyond a manually/endpoint-triggered runner (avoids the D4
  cron gap); scheduling is a deliberate later decision.
- **Proves the governance seams before any capability exists:** attribution, idempotency,
  retry, org-isolation, audit — end-to-end, with a trivial no-op/deterministic job, under the
  full test gate.

Only after this foundation is ratified, built, gated, and (optionally) released would Phase
2.0.2 (Deterministic Reminders) consume it. **Recommendation:** ratify Phase 2.0.1 as the first
slice; produce its own decision package + implementation plan when ready.

---

## 6. Standing constraints (carried verbatim into every V2.0 phase)

Automation must **never**: modify deterministic underwriting calculations · become an
underwriting calculation input · bypass `UNDERWRITING_APPROVAL` · bypass Closing checklist
policy · bypass the composed PAID gate · directly mutate Escrow / Financing / Assignment /
Underwriting terminal states without an **explicitly ratified** approval mechanism · overwrite
immutable snapshots · silently alter historical `ActivityLog` records · create cross-organization
reads or writes · send external communications without an explicit policy and audit trail · treat
AI output as authoritative fact without provenance and review. **The frozen V1.3 (`v1.3.0`) and
V1.4 (`v1.4.0`) baselines, locks, engines, lifecycles, and the PAID gate are untouched.**

---

## 7. Decisions requested (ratification gate)

1. **D1–D10 core determinations** — ratify as the V2.0 governing architecture.
2. **Capability–permission matrix (§2)** — ratify the five-category classification (esp. the
   **PA** line as *forbidden autonomous actions*).
3. **Phased roadmap (§3)** — ratify the deterministic-first ordering (or amend).
4. **First slice (§5)** — approve **Phase 2.0.1 (Automation Foundation + Job Execution &
   Audit)** as the smallest safe foundation, vs. an alternative first phase.
5. **Standing constraints (§6)** — reaffirm.

On ratification, the next step is a **Phase 2.0.1 decision package + implementation plan** (that
phase only) → feature branch → full gate → commit → **stop before merge**. **No Version 2.0
feature code is written until then.**
