# Version 2.0 (Automation & AI) — Repository Discovery Report

> **Status: PENDING FOUNDER RATIFICATION.** Discovery + architecture determination only.
> **No implementation code was written; no frozen 1.3/1.4 branch, lock, boundary, engine,
> lifecycle, PAID gate, or production state was touched.** `main` and the authoritative
> repository docs are the source of truth. Companions: [Version 2.0 Decision Package](./VERSION_2_0_DECISION_PACKAGE.md)
> and the [Automation Architecture Lock](./AUTOMATION_ARCHITECTURE_LOCK.md) (founder refinements
> A1–A8 / invariants AU-1…AU-13).

This report inventories what the platform already provides that Automation & AI must build
**on** (not around), and what is genuinely **greenfield**. Every claim is cited to the repo.

---

## Executive finding

The platform is unusually well-prepared for **deterministic** automation and unusually
**empty** of AI. Two mature, battle-tested substrates already encode the exact disciplines
V2.0 needs — **idempotent job execution with a single audit surface** (`RefreshJob`) and
**write-ahead, error-classified, retryable delivery** (the email outbox). Both are already
built around the principle V2.0 must preserve: *automation proposes and records; humans and
the deterministic engines own the truth.* AI, SMS, reminders, a job scheduler, feature
flags, and evaluation infrastructure **do not exist yet** — so they can be introduced
cleanly, on top of the existing seams, rather than retrofitted.

**Therefore: deterministic automation should come before AI** — the safe foundation already
has precedent; AI is the part that needs new provenance, versioning, and evaluation scaffolding.

---

## 1. Scheduling / queue / worker / cron / webhook / background processing

**Verdict: no general-purpose scheduler or queue exists — greenfield, but with two strong
in-repo execution precedents to model on.**

- **Dependencies are minimal** (`package.json`): `@prisma/client`, `next`, `nodemailer`,
  `react`. **No** BullMQ, no `node-cron`, no queue/worker library. No worker entrypoint in
  `scripts` (only build/test/db/perf/playwright scripts).
- **No cron is installed.** The backup tooling (`scripts/backup.sh`) has a `cron` mode but
  timers are **not** scheduled (tech-debt **D4**). The email outbox has a **drain** but it
  is **not** scheduled either (**D6**).
- **`RefreshJob`** (`prisma/schema.prisma:394`, `@@map("refresh_jobs")`) is the canonical
  **job-execution + audit** precedent: `status`, `requestKey` (idempotency),
  `targetEntityType/Id`, counts (`observationsRecorded/signalsAccepted/signalsSuperseded`),
  `affectedEntityIds[]`, `actorUserId`, `error`, `startedAt/finishedAt`, and — critically —
  **`@@unique([organizationId, sourceKey, requestKey])`** so a re-submitted run **returns the
  existing job instead of applying twice.** Its header comment states it is the *"SOLE audit
  surface for ingestion (no separate event stream)"* and that refresh is **OBSERVATIONAL** —
  it *"only creates Observations/Signals and triggers Projection; it never creates/merges/
  splits Owners and never deletes."* This is precisely the "propose, don't mutate authoritative
  truth" posture V2.0 automation must inherit.

## 2. ActivityLog — event families & audit guarantees

**Verdict: a rich, org-scoped recorded-event substrate exists — but audit is best-effort, not
a guaranteed ledger.**

- `model ActivityLog` (`prisma/schema.prisma:1749`): `organizationId`, optional
  `opportunityId/propertyId/sellerId/buyerId`, `actorId`, `eventType`, `eventLabel`,
  `eventBody`, `createdAt`; only index `@@index([organizationId])`.
- ~20 event families already emitted: `opportunity.*` (incl. `stage_changed`), `escrow.*`,
  `financing.*`, `assignment.*`, `closing.*`, `underwriting.decided`, `offer_memo.generated`,
  `assignment_agreement.generated`, `document.*`, `note.*`, `task.*`, `buyer.*`,
  `buyer_match.*`, `authorization.*`, `invitation.*`, `organization.*`, `owner.*`,
  `property.*`, `seller.*`, `user.*`.
- **Best-effort caveat:** each Closing-domain `audit()` helper ends `.catch(() => {})` (e.g.
  `lib/escrow-service.ts:57`) — the operational write succeeds even if the log row fails. So
  `ActivityLog` is an **as-recorded narrative** (Timeline invariant TL-2), not an authoritative
  or complete ledger. **Implication for V2.0:** automation may *observe* ActivityLog for
  triggers, but must never treat it as a guaranteed event bus for correctness, and must never
  silently rewrite historical rows.

## 3. Email / SMS / document-generation / task / reminder

- **Email — mature outbox (`lib/email/`).** `MessageService` (`message-service.ts`) is a
  write-ahead **audit ledger**: *"A row is written BEFORE the transport is called, then advanced
  to SENT/FAILED (survives a crash mid-send)."* `RetryPolicy` (`types.ts:53`) =
  `inline-only | drainable | manual-only`; `TransportResult.permanent` (`types.ts:86`)
  classifies non-retryable failures (bad address/auth/5xx); the **drain reconstructs the body
  fresh from the source of truth** at send time (no stale replay). `EmailTransport` interface
  with Console + SMTP (`nodemailer`) transports; closed typed registry per message kind.
  Deferred (D6): scheduled drain, bounce/complaint webhooks, digests, Resend/API transport.
- **SMS — does not exist.** No `twilio`/`sms` code anywhere. Greenfield (and requires a provider).
- **Document generation — deterministic framework exists.** Offer-Memo (`lib/documents/offer-memo.ts`)
  and Assignment-Agreement inherit one framework (CC-F): a **pure, deterministic** snapshot
  assembler + HTML renderer (no clock/RNG), behind a Documents-owned immutable, append-only,
  SHA-256'd row. This is the seam any *generated draft/content* capability should reuse.
- **Task — first-class.** A `Task` domain (model + `app/(workspace)/tasks/actions.ts`, audited).
  A "draft task" capability produces a proposed task a human accepts into this domain.
- **Reminder — does not exist.** No reminder/due-soon/overdue-notification code. Greenfield —
  but the *inputs* (due dates, overdue detection) already exist as pure projections (§7).

## 4. RBAC resources & human-approval seams

**Verdict: a complete policy layer and explicit human-approval seams already exist — V2.0
routes every real effect through them.**

- `lib/permissions.ts`: `Resource` enum includes `SELLER, PROPERTY, OPPORTUNITY, BUYER,
  BUYER_MATCH, TASK, NOTE, DOCUMENT, TEAM, INVITATION, ORGANIZATION, OWNER, OWNER_IDENTITY,
  PROPERTY_IDENTITY, REFRESH, UNDERWRITING, UNDERWRITING_APPROVAL, CLOSING` (+ legacy
  `DEAL_ANALYSIS`). `Action = CREATE|READ|UPDATE|DELETE|MANAGE`. A capability map assigns
  write/read role sets per resource; `can(role, action, resource)` is the gate.
- **Separation-of-duties + high-risk seams (the approval surface V2.0 must honor):**
  `UNDERWRITING_APPROVAL` is deliberately separate from `UNDERWRITING` authoring (AP-5 — an
  analyst may author but not decide); plus specialized ADMIN-tightened guards
  `canWaiveClosingItem` (CC-5), `canResolveEscrow` (EC-G), `canResolveFinancing` (FC-G),
  `canExecuteAssignment` (AS-G), `canMergeOwners`, `canReopenMatchDecision`, and the composed
  `canMoveStage` (the PAID gate, CC-2/CC-3).
- Enforcement + audit centralize in `lib/authorize.ts` (denials audited). **Implication:** an
  automation principal must be a *first-class role/policy*; a worker's real effects are gated
  by these same predicates, and automation cannot invent a bypass.

## 5. Deterministic projection modules

**Verdict: the read layer V2.0 automation should consume already exists and is pure.**

- `lib/transaction-dashboard.ts` — per-opportunity projection incl. `nextMilestone`
  (overdue/upcoming with an **injected reference date**), `readiness`/`blockingItems`, per-domain
  status, `responsibleParties`; plus `projectClosingBadges` (Slice 7). Pure, clock-free.
- `lib/transaction-timeline.ts` — per-opportunity chronological projection over `ActivityLog`.
- `lib/closing.ts` — `closingProgress` / `blockingItems` / `isClosingReady` (the authoritative
  readiness + PAID-gate primitives). `lib/intelligence/projection*.ts` — entity projections.
- **Principles TX-4 Projection Composition / TX-6 Projection Reuse** mean automation that
  reasons about closing health must consume these modules — not recompute — so it can never
  drift from the UI.

## 6. Underwriting findings / recommendation boundary (FROZEN, V1.3)

**Verdict: a hard, deterministic boundary that automation must only read.**

- `Underwriting → UnderwritingScenario → UnderwritingAssumption → ScenarioResult →
  ScenarioFinding → ScenarioRecommendation → UnderwritingDecision`
  (`prisma/schema.prisma:953,972,1008,1183,1236,1259`). The kernel `lib/analysis.ts` is
  **untouched since V1.2**; lineage + fingerprints identify calculation semantics.
- `UnderwritingDecision` is append-only on a **LOCKED** scenario; `UNDERWRITING_APPROVAL` is
  the terminal human decision layer (AP-1…AP-6), never a calc input. The one read seam
  (Financing → sized debt) is one-way, non-persisted (FC-0/FC-15). **Implication:** AI may
  *summarize/explain* underwriting outputs as advisory text, but must **never** feed the
  engine, alter a calculation, or bypass `UNDERWRITING_APPROVAL`.

## 7. Closing milestones / blockers / due dates / responsible-party fields

**Verdict: all trigger inputs for deterministic reminders already exist.**

- `ClosingChecklistItem`: `dueDate`, `ownerId` (responsible party), `required`, `status`,
  `completedAt`, `waivedAt`. `EscrowRecord`: `earnestDueDate`, `contingencyDeadline`.
  `Opportunity`: `targetCloseDate`, `stage`.
- These are already surfaced as **deterministic projections** (`nextMilestone`/overdue,
  `blockingItems`, `responsibleParties`) by `lib/transaction-dashboard.ts`. A reminder/alert
  capability is a *pure derivation over data that already exists* + an advisory notification —
  no new operational truth.

## 8. Intelligence observations / signals / provenance / resolution

**Verdict: the platform already has a production-grade "propose, don't own" pattern with
provenance and versioning — the template for AI outputs.**

- `Observation` (`:316`) → `IntelligenceSignal` (`:351`): each signal carries `sourceCategory`,
  `sourceId`, `licenseRef`, `asOf`/`retrievedAt`, `confidence`, `method`, `state`
  (`ACCEPTED`/superseded via `supersededById`), `isOverride`, and **four version stamps**
  (`adapterVersion`, `schemaVersion`, `normalizationVersion`, `projectionVersion`).
- Refresh is **observational + idempotent + deterministically replayable** (§1); resolution
  (identity/merge) is a **separate high-risk human-gated** decision (`OWNER_IDENTITY` /
  `PROPERTY_IDENTITY`). This signal/provenance/state/version model is the natural precedent for
  how **AI outputs** should be represented: advisory, provenance-stamped, versioned, in a state
  machine (proposed → accepted/rejected/superseded), never overwriting, never authoritative.

## 9. Provider abstractions & production safety gates

- **Provider abstractions exist** where the platform talks to the outside: `EmailTransport`
  (Console/SMTP) and the intelligence **source adapters** (`lib/intelligence/sources`, with
  `adapterVersion`). AI will need a *new* provider abstraction of the same shape.
- **Safety gates:** `scripts/predeploy-check.mjs` (fails a build run as root / with
  foreign-owned dist / non-writable — no bypass, D5 guard); `assertTestDatabase` guards every
  E2E/seed against prod; restore-verified backups before every migration. These are the model
  for automation's production safety posture.

## 10. Retry / idempotency / deduplication / error-classification / dead-letter

**Verdict: all present in two forms — reuse, don't reinvent.**

- **Idempotency/dedup:** `RefreshJob` `(organizationId, sourceKey, requestKey)` unique anchor;
  content-idempotent identity rebuilds (`lib/intelligence/property-identity.ts` — "zero-write
  idempotent rebuild"); value-grain supersession (a signal equal to the lineage head is skipped).
- **Retry + error-classification:** the outbox `RetryPolicy` (`inline-only`/`drainable`/
  `manual-only`) + `TransportResult.permanent` (transient vs permanent) + write-ahead ledger
  advanced to `SENT`/`FAILED`.
- **Dead-letter:** the terminal `FAILED` state in the outbox is the de-facto dead-letter (no
  separate DLQ). Deterministic **replay** (refresh) gives byte-identical re-runs.

## 11. AI / model-provider code / prompts / schemas / feature flags / evaluation

**Verdict: entirely greenfield.** No `@anthropic-ai/sdk`/`openai`/model-provider dependency;
no prompt files, no model schemas, no embeddings, no evaluation harness, and **no feature-flag
system** anywhere in `lib/`, `app/`, or `package.json`. This is an advantage: AI can be
introduced behind a *new* provider abstraction (mirroring `EmailTransport`), with structured-output
schemas, versioned prompts, a provenance/state model (§8), and an evaluation harness — all built
to the platform's existing standards from the start, with **no legacy AI to reconcile.**

## 12. Notifications (delivery surface)

**Verdict: an in-app notification surface exists, derived — not a delivery system.**

- `lib/notifications.ts` (`recentNotifications`, `unreadCount`, `NOTIFICATIONS_CAP`) +
  `app/(workspace)/notifications/` render a **projection over `ActivityLog`** against a per-user
  **`lastNotificationsReadAt`** cursor (`prisma/schema.prisma:259`). It is **in-app only** — no
  push, email, or SMS delivery of notifications. A reminder/alert capability can surface **in-app**
  immediately (reuse this cursor pattern), and only later opt into **outbound delivery** via the
  email outbox under explicit policy.

---

## Cross-cutting conclusions (feeding the Decision Package)

1. **Deterministic-first is evidence-based, not assumed.** The safe substrate (idempotent jobs,
   write-ahead delivery, pure projections, explicit approval seams) already exists; AI is the
   part that needs new scaffolding. Build the automation foundation on the `RefreshJob` + outbox
   patterns first, then deterministic reminders over existing projections, then formalize
   human-approval, then AI.
2. **Automation orchestrates + proposes; it never owns operational truth.** The `RefreshJob`
   "observational" posture and the intelligence signal "propose → human-accept" state machine are
   the templates: automation may own its own *execution/audit/proposal* records, never a domain's
   authoritative state.
3. **Every real effect flows through an existing human-approval seam** (`can*` predicates,
   `UNDERWRITING_APPROVAL`, the composed PAID gate). Automation cannot invent a bypass.
4. **AI outputs are advisory, provenance-stamped, versioned, state-machined** — modeled on
   `IntelligenceSignal`, never a calculation input, never authoritative without review.
5. **Reuse the existing idempotency / retry / error-classification / audit machinery** for
   attribution, dedup, retryability, and safe provider-failure handling.
6. **Event-driven over polling is already precedented.** The email outbox is a
   **transactional-outbox**: an intent row written in the same transaction as the domain write,
   then drained. This supports an **event-driven** Automation domain (A6) with a low-frequency
   reconciliation sweep as a bounded backstop — not cron polling as the primary mechanism.
   `ActivityLog` is best-effort (§2), so it is a **trigger/observation** source, never a reliable
   event bus for correctness.
7. **Automation is a bounded domain with its own immutable operational ledger.** Per the
   [Automation Architecture Lock](./AUTOMATION_ARCHITECTURE_LOCK.md) (A1/A8): `AutomationExecution`
   records *what automation did* (operational audit), complementing — never replacing — the
   `ActivityLog` record of *what happened to the business*.
