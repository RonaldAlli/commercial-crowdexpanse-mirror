# CrowdExpanse Commercial — Platform Architecture Map

> **What this is:** a single, implementation-agnostic map of the whole platform as it
> stands at the close of **Version 1.4** — the layers, the flow of truth, the ownership
> boundaries, and the cross-cutting frameworks. It is **documentation, not code**. Its
> purpose is to give the upcoming **Version 2.0 (Automation & AI)** work a stable mental
> model to build on, so automation interacts with the platform through its established
> seams rather than around them.
>
> **Companion detail:** per-domain contracts live in
> `CLOSING_CENTER_ARCHITECTURE_LOCK.md`, the underwriting engine in the V1.3 locks, and
> the intelligence substrate in `COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md`. This map ties
> them together.

---

## 1. The spine — one deal's journey

```
                          COMMERCIAL INTELLIGENCE
           (Owner / Property identity, enrichment, sources, matching)
                                     │
                                     │  sourced & enriched entities
                                     ▼
                              OPPORTUNITY  ───────────────┐
                 (the pipeline unit: LEAD … PAID, stage)   │  buyer matching
                                     │                      ▼
                                     │                   BUYERS
                                     ▼
                        COMMERCIAL UNDERWRITING  (Version 1.3 — FROZEN)
        Underwriting → Scenario → Assumptions → ScenarioResult → Findings
        → Recommendation → UnderwritingDecision (terminal, append-only)
        deterministic engine (lib/analysis.ts) · lineage · fingerprints
                                     │
                                     │  a decided, LOCKED scenario  (read-only reference only)
                                     ▼
                          CLOSING CENTER  (Version 1.4)
        the human, operational "last mile": UNDER_CONTRACT → … → PAID
                                     │
        ┌──────────────── OPERATIONAL DOMAINS (own state) ───────────────┐
        │   Due Diligence      Escrow       Financing      Assignments   │
        │   (ClosingChecklist) (EscrowRec.) (FinancingRec) (AssignmentRec)│
        └────────────────────────────────────────────────────────────────┘
                                     │
        ┌──────────────── READ MODEL (own NO state) ─────────────────────┐
        │   Transaction Dashboard   Transaction Timeline   Opp-List Badges│
        │   (breadth: all deals)    (depth: one deal)      (list health)  │
        └────────────────────────────────────────────────────────────────┘
```

**Reading it:** truth flows **down**. Intelligence produces entities; an Opportunity
carries a deal through the pipeline; Underwriting produces a *decided* analysis; the
Closing Center manages the operational last mile. Each layer **reads** from the one above
through a narrow, explicit seam and never reaches back to mutate it.

---

## 2. Cross-cutting layers (the same everywhere)

### 2.1 The Projection layer — "one source, many consumers"

The defining pattern of the Closing Center's read model. Every read surface is a **pure
projection** over operational records that already exist:

```
        OPERATIONAL RECORDS  (ClosingChecklist, Escrow, Financing, Assignment, ActivityLog)
                                     │
                                     ▼
        PURE PROJECTION MODULES   lib/transaction-dashboard.ts  ·  lib/transaction-timeline.ts
           (no Prisma, no clock, plain-data-in / new-data-out, never mutate)
                                     │
             ┌───────────────┬───────┴────────┬────────────────┐
             ▼               ▼                ▼                ▼
         Dashboard        Timeline       Opp-List Badges    (future) Reporting / widgets
```

Governing principles (locked):
- **TX-4 Projection Composition** — read surfaces *compose* the same pure modules.
- **TX-6 Projection Reuse** — no surface *recomputes* closing status independently
  (readiness, blocker count, Escrow/Financing/Assignment status). One source, many
  consumers. This is why the Dashboard, Timeline, and List badges can never disagree.
- **TX-5 Projection Version** — *reserved* (not implemented): a future identifier for a
  surface's rendering/ordering/aggregation semantics, independent of the data.

Consequences: **no cached readiness, no materialized view, no duplicated business logic,
no second source of truth.** A projection is derived at read time and thrown away.

### 2.2 Documents & the Generated-Document framework

```
        UPLOADED Documents  ────────────────┐
                                             ▼
                                        Document (Prisma)
                                             ▲
        GENERATED Documents  ────────────────┘
          Offer Memo (V1.3)        Assignment Agreement (V1.4, reuses the same framework, CC-F)
          · immutable canonical snapshot   · SHA-256 content hash
          · append-only generationSequence · file-first write + compensating cleanup
          · regenerable until "locked" (e.g. assignment execution)
```

The generated-document framework (introduced by the Offer Memo, reused by Assignments) is
a reusable seam: a deterministic snapshot assembler + HTML renderer (pure, no clock/RNG)
behind a Documents-owned immutable row. Underwriting and Closing **read** into it one-way;
they never own generated files.

### 2.3 ActivityLog — the recorded-history substrate

```
        every domain write  ──(best-effort audit)──▶  ActivityLog
          (org + optional opportunity/property/seller/buyer scoped, actor, eventType, label, body)
                                     │
                                     ├─▶ org-wide /activity feed
                                     └─▶ Transaction Timeline  (per-opportunity projection, TL-1)
```

`ActivityLog` is an **as-recorded narrative**, not an authoritative ledger (the audit path
is best-effort). The Timeline honors this: it renders what was recorded (TL-2/TL-10),
links out to authoritative artifacts rather than copying them (TL-11), and never
synthesizes events.

### 2.4 RBAC & org isolation (uniform)

`lib/permissions.ts` (pure policy) → `lib/authorize.ts` (enforcement + audit). Every write
is role-checked and audited; every query is `organizationId`-scoped by convention (D2 —
mitigated by cross-org E2E tests, not yet RLS). The Closing Center adds a `CLOSING`
resource and ADMIN-only reasoned overrides (waivers, terminal resolutions, assignment
execution). Read surfaces reuse existing read permissions and add **no** new RBAC.

---

## 3. Ownership boundaries (what must never blur)

| Boundary | Rule | Enforced by |
|---|---|---|
| **Underwriting engine (V1.3, FROZEN)** | Deterministic; the Closing Center and all read surfaces only **read** a decided/LOCKED scenario; `lib/analysis.ts`, lineage, and fingerprints are never touched by 1.4 | FC-0/FC-15 reference boundary; CC-1; untouched `lib/analysis.ts` since V1.2 |
| **Closing = human workflow** | Operational, outside the deterministic engine; never a calc input | CC-1, EC/FC/AS "-1/-9/-10" invariants |
| **PAID authorization gate** | `isClosingReady()` (pure) **composed with** role-based `canMoveStage()` — composed, never replaced or bypassed | CC-2/CC-3, re-proven every slice |
| **Domains own state; read model owns none** | Dashboard/Timeline/Badges derive at read time; no writes, no persistence | TX-2/TX-3, LB-1/LB-5 |
| **Projection reuse** | No surface recomputes closing status | TX-4/TX-6 |
| **Money convention** | Operational money = Int USD; `Decimal` reserved for the underwriting engine; cross-domain refs = plain scalar ids (no FK) | domain models |
| **Generated documents** | Documents-owned, immutable, append-only; producers read one-way | CC-F, OM-*/AS-* |

---

## 4. Data-ownership quick reference

| Concern | Owner (source of truth) | Read by |
|---|---|---|
| Deal & pipeline stage | `Opportunity` | everything |
| Deal economics / debt sizing | Underwriting `ScenarioResult` (V1.3) | Financing panel (read-only ref), Offer Memo |
| Due-diligence readiness | `ClosingChecklist` + items | PAID gate, Dashboard, Badges |
| Earnest money / escrow lifecycle | `EscrowRecord` (+ immutable `EscrowEvent`) | Dashboard, Timeline, Badges |
| Lender process | `FinancingRecord` (immutable FC-J snapshot) | Dashboard, Timeline, Badges |
| Assignment / wholesale fee | `AssignmentRecord` (+ execution snapshot) + `Opportunity.assignmentFeeUsd` | Dashboard, Timeline, Badges |
| Recorded history | `ActivityLog` | /activity feed, Timeline |
| Generated agreements/memos | `Document` (GENERATED) | opportunity surfaces |

---

## 5. Where Version 2.0 (Automation & AI) plugs in

This map exists so automation builds on seams, not around them. The natural, non-invasive
entry points:

- **Read through the projection layer, not the tables.** Automation that reasons about
  closing health should consume the pure projection modules (TX-6), so it sees exactly
  what the UI sees and cannot drift.
- **Observe via `ActivityLog`.** The recorded-history substrate is the honest event stream
  for triggers/notifications — with the as-recorded caveat (TL-2) understood.
- **Respect the boundaries in §3.** Automation must not become a hidden calc input to the
  frozen underwriting engine, must not bypass the composed PAID gate, and must not create
  a second source of truth for closing state.
- **Prefer new pure modules + thin services.** The whole platform is "operational records
  → pure projection → thin read/write service → UI/action"; automation is most naturally a
  new consumer/producer at those same seams.

Reserved, benchmark-gated follow-ups that touch this map: an additive `ActivityLog`
`(organizationId, opportunityId, createdAt)` index (TX-A/TL-9/LB-8) once real Timeline/List
volume justifies it; Board-level closing badges (LB-7); and the D15 `DealAnalysis` removal
(separately reviewed, out of every closeout so far).

---

## 6. The Automation domain (Version 2.0 — PROPOSED, pending ratification)

> Specified conceptually in the [Automation Architecture Lock](./AUTOMATION_ARCHITECTURE_LOCK.md)
> (invariants AU-1…AU-13). **Not built.** Shown here so the whole-platform picture already
> reserves its place as a **cross-cutting orchestration layer** — never a new source of truth.

Automation sits *beside* the spine as a bounded orchestration domain that **reads** projections
and events, **evaluates policy**, **calls existing domain services** through the same human seams
a person uses, and **records its own execution** in an immutable operational ledger:

```
   domain event / schedule
          │
          ▼
   SCHEDULER → JOB QUEUE → EXECUTOR → POLICY ENGINE → EXISTING DOMAIN SERVICE
          │                              (Projection → Policy → RBAC)          │
          │                                                                     ▼
          │                                                              ActivityLog  (business ledger)
          ▼
   AutomationExecution  (immutable OPERATIONAL ledger — complements ActivityLog, never replaces it)
          ▲
   Automation Principal: USER · SYSTEM · AUTOMATION · WEBHOOK   (never impersonates a user)
```

- **Owns:** AutomationPolicy · AutomationJob · AutomationExecution · AutomationProposal ·
  AutomationAction · AutomationResult. **Owns no** business truth, underwriting, closing state,
  calculations, or approvals (AU-1).
- **Advisory-until-accepted:** outputs are proposals a human commits through the real seam; AI is
  advisory, five-version stamped, schema-validated, and walled off from calculations (AU-5/AU-9).
- **Two complementary ledgers:** `AutomationExecution` (what automation did) ⟂ `ActivityLog`
  (what happened to the business) (AU-8).
- **Event-driven preferred** (transactional outbox, per the email-outbox precedent) with a bounded
  reconciliation sweep; not cron polling as the primary mechanism (AU-10).
