# Commercial Real Estate Operating Workspace — UI Milestone 1 Plan

> **Status: PLANNING ONLY — for the UI Milestone 1 Planning Review.** Moves from *"what should exist?"*
> (the UI Foundation Plan) to *"exactly how will Milestone 1 be implemented?"* — **without writing any
> code**. Builds on `UI_FOUNDATION_PLAN.md` and its audit verified at `904a56b` (unchanged on `main`,
> now `1f19301`, which added only docs). Selects an implementation for nothing.
>
> **Not authorized by this document:** code, React components, routes, backend/service changes, schema
> changes, APIs, wireframes, or mockups. Section 9 is grounded in the audited repository; exact service
> signatures were re-verified at `1f19301`.

## Milestone 1 scope (fixed)

Only: **Command Center · Seller Work Queue · Seller Record · Opportunity Workspace · Activity Timeline ·
Next Best Action · Missing Information.** Future milestones (Underwriting, Buyer Matching, Capital,
Communications, Deal Room, Closing, Revenue) do **not** enter implementation until Milestone 1 is
complete.

---

## 1. Milestone objective

- **Business objective:** turn the already-governed seller-acquisition engine into a product an
  acquisition team can operate for a full working day, so more sellers are worked, qualified, and promoted
  to opportunities.
- **User objective:** a representative opens one landing page, sees who to work, works them, and always
  knows the single next step and what is missing — without touching the database or understanding the
  scoring/governance internals.
- **Operational objective:** a thin **read-and-guide** layer over existing services and existing write
  paths. No new domain models, no new authority, no new write paths beyond those that already exist.
- **Success definition (qualitative; measurable criteria deferred to the build initiative):** a rep can
  work the seller queue end-to-end; every seller and opportunity shows a correct, explainable next action;
  missing inputs are obvious and distinguished from known negatives.

---

## 2. Screen inventory

Legend for *current status*: **BINDABLE** (real service exists) · **SYNTHESIS** (deterministic derivation
over existing facts; no engine) · **NEW-SHELL** (a new read façade/page over existing services).

| Screen | Purpose | Primary user | Entry point | Exit points | Backend services (verified) | Current status |
|---|---|---|---|---|---|---|
| **Command Center** | Action-oriented landing work-board | Rep / Manager | post-login default | Seller Queue, Seller Record, Opportunity | `getAcquisitionQueue`, `getDailyAcquisitionMetrics`, `getTransactionDashboardRows`, BI primitives | **NEW-SHELL** (orchestrates 3–4 services; no façade exists) |
| **Seller Work Queue** | Prioritized list-to-conversation | Rep (ACQUISITIONS) | Command Center / nav `/acquire` | Seller Record | `getAcquisitionQueue`, `getDailyAcquisitionMetrics` | **BINDABLE** (route exists) |
| **Seller Record** | Single seller operating record | Rep | Queue row | Opportunity (promote) | `seller.findFirst`, `sellerQualificationChecklist`+`checklistProgress`, `buildTimeline`, owner services | **BINDABLE** (route exists) |
| **Opportunity Workspace** | Single deal operating record | Rep / Manager | Seller promote / `/opportunities/[id]` | Timeline, stage move | opportunity detail includes, `STAGE_OPTIONS`/`moveOpportunityStage`/`evaluateStageMove`, `summarizeDiligence`, `getActiveScenarioResult` (ref), `getClosingGateStatus` | **BINDABLE** (route exists) |
| **Activity Timeline** | Chronological evidence of what happened | Rep / Manager | within Seller Record & Opportunity | deep links | `getOpportunityTimeline`+`TransactionTimelinePanel`; `buildTimeline` (seller) | **BINDABLE** (already bound on detail page) |
| **Next Best Action** | The single most useful next step | Rep | panel on Queue row / Record / Opportunity | the action itself | synthesis of checklist, `nextFollowUpAt`, `resolveSellerPromotion`, `evaluateStageMove.suggestedAction`, `summarizeDiligence`, closing `blockingItems`, tasks | **SYNTHESIS** (no engine) |
| **Missing Information** | What's absent/negative and blocking | Rep | panel on Record / Opportunity | the fix action | synthesis of checklist gaps, data-quality flags, diligence status, stage-policy `missingTruth`/`missingArtifacts`, `validateAssumptions` | **SYNTHESIS** (no engine) |

---

## 3. Navigation flow (user flow only — no component design)

```
Login → Command Center
  Command Center ──(pick a queue item)──▶ Seller Work Queue
    Seller Work Queue ──(open a row)──▶ Seller Record
      Seller Record ──(Next Best Action = "Promote")──▶ Opportunity Workspace
        Opportunity Workspace ──(open timeline / stage move)──▶ Activity Timeline (in-context)
  Command Center ──(at-risk closing / opportunity-ready)──▶ Opportunity Workspace (directly)
```

- Every screen is reachable from the Command Center in ≤2 hops.
- Next Best Action and Missing Information are **panels within** Queue rows, the Seller Record, and the
  Opportunity Workspace — not separate destinations.
- Back-navigation always returns to the originating queue with its position preserved (flow requirement,
  not a component spec).

---

## 4. Screen contracts

For each screen: **required information · computed information · recommendations · actions · dependencies ·
unavailable features.** (Field-level Observed/Computed/Recommended tagging is §6.)

### Command Center
- **Required (Observed):** counts of sellers needing follow-up, at-risk closings, opportunities-ready,
  all-time revenue-by-source.
- **Computed:** queue size / due-today (`getDailyAcquisitionMetrics`), overdue-milestone flag
  (`getTransactionDashboardRows`), opportunities-ready (derived from `OpportunityStage`), revenue
  (BI primitives).
- **Recommendations:** "start here" — the highest-priority queue to work now (synthesis).
- **Actions:** navigate into a queue/record/opportunity.
- **Dependencies:** `getAcquisitionQueue`, `getDailyAcquisitionMetrics`, `getTransactionDashboardRows`,
  `revenueByChannel`/`assignmentRevenueByCampaign`/`revenueByAcquisitionEvent`.
- **Unavailable:** appointments queue (no model), offers queue (no `Offer` entity), per-period revenue
  (BI is all-time only) — these must be **omitted or labeled "not yet available"**, never faked.

### Seller Work Queue
- **Required (Observed):** name, company, phone, `outreachStatus`, `nextFollowUpAt`, last touch.
- **Computed:** queue order (due/overdue first, then oldest unscheduled; DEAD/DNC excluded), daily metrics.
- **Recommendations:** per-row Next Best Action (§7).
- **Actions:** open record, set status (`setSellerOutreachStatus`), log disposition (`recordDisposition`),
  promote when eligible (`resolveSellerPromotion`).
- **Dependencies:** `getAcquisitionQueue`, `getDailyAcquisitionMetrics`, `lib/contact-options` labels.
- **Unavailable:** motivation/priority score (queue is date-only — do not present a "priority score"),
  seller-level dedup.

### Seller Record
- **Required (Observed):** identity/contact fields, `outreachStatus`, attribution channel, owner link,
  data-quality flags (`badPhone`, `doNotCall`…), `nextFollowUpAt`.
- **Computed:** `checklistProgress` (done/total over the 5 qualification items), unified timeline.
- **Recommendations:** Next Best Action + Missing Information (§7/§8).
- **Actions:** status, disposition, log touch (`logContactTouchAction`), schedule follow-up (sets
  `nextFollowUpAt`), promote, link/unlink owner.
- **Dependencies:** `seller.findFirst` (existing includes), `sellerQualificationChecklist`,
  `checklistProgress`, `buildTimeline`, owner services, `commsGate` (DNC/consent surfacing).
- **Unavailable:** appointment booking (no model; only `nextFollowUpAt`), seller-linked tasks
  (`Task` has no `sellerId`), structured disqualification-reason enum, call-prep artifact, general
  missing-field detector beyond the 5 checklist items.

### Opportunity Workspace
- **Required (Observed):** title, `stage`, source/attribution, seller + property + owner contact,
  `contractValueUsd`/`assignmentFeeUsd`.
- **Computed:** diligence summary (`summarizeDiligence` → missing / readyForUnderwriting), closing
  readiness (`getClosingGateStatus`), stage-move evaluation (`evaluateStageMove` →
  `missingTruth`/`missingArtifacts`/`suggestedAction`), underwriting headline (reference via
  `getActiveScenarioResult`).
- **Recommendations:** Next Best Action + Missing Information.
- **Actions:** move stage (`moveOpportunityStage`, policy-gated), update diligence.
- **Dependencies:** opportunity detail includes, `STAGE_OPTIONS`/`stageLabel`, timeline service.
- **Unavailable:** opportunity-level financials/occupancy/debt columns (live in the underwriting engine,
  not on the opportunity — surface as reference, not as opportunity fields), a computed risk score, the
  dormant pipeline projection (**bind native `OpportunityStage`, never `PipelineFact`**).

### Activity Timeline
- **Required (Observed):** chronological `ActivityLog` events (type, label, actor, time).
- **Computed:** projection/ordering/pagination (`projectTimeline`), deep links (`resolveNoteLink`).
- **Recommendations:** none (evidence surface).
- **Actions:** open the linked entity.
- **Dependencies:** `getOpportunityTimeline` + `TransactionTimelinePanel`; `buildTimeline` for the seller.
- **Unavailable:** a unified cross-entity timeline — the opportunity-scoped query shows only events
  carrying `opportunityId`; seller/property-only events require a widened query (flag, do not silently
  merge).

### Next Best Action (panel) — see §7
### Missing Information (panel) — see §8

---

## 5. UI evidence model (carried forward)

Every recommendation in Milestone 1 is presented as an evidence chain, never a bare directive:

```
Recommendation → Supporting evidence → Missing evidence → Confidence → Next action
```

- **Why:** the reason the step is recommended.
- **Supporting facts:** the concrete Observed/Computed values behind it (e.g., `QUALIFIED` + checklist
  complete → promote).
- **Missing facts:** what would raise confidence (unset checklist items, no contact made).
- **Confidence:** qualitative (high/medium/low) derived from completeness; **"not yet scored"** where no
  numeric basis exists — never fabricated.
- **Next action:** the single most useful step.

---

## 6. Element taxonomy

Every displayed field in Milestone 1 belongs to **exactly one** category. Users must be able to tell them
apart at a glance (visual distinction is a build-time concern; the *classification* is fixed here).

- **Observed** — directly stored facts. *Examples:* owner name, property address, seller phone,
  `outreachStatus`, opportunity `stage`, `nextFollowUpAt`, attribution channel, `doNotCall`.
  *Purpose:* ground truth; the user can trust these as-is.
- **Computed** — deterministic calculations over stored facts. *Examples:* `checklistProgress` (done/total),
  queue ordering, closing readiness, milestone-overdue flag, NOI/cap rate/DSCR/match score (referenced
  from the underwriting/matching engines). *Purpose:* derived truth; reproducible, explainable by its
  inputs.
- **Recommended** — system guidance. *Examples:* Next Best Action, Missing Information items, suggested
  follow-up. *Purpose:* advice, not fact; **always** accompanied by the evidence chain (§5) and never
  styled as an Observed fact.

**Distinguishability rule:** a Recommended element must never be visually indistinguishable from an
Observed fact; a Computed value must always be traceable to its inputs. (How this is rendered is a build
decision; the requirement is fixed here.)

---

## 7. Next Best Action engine (no algorithms — contract only)

Do **not** design the ranking algorithm here. Define the contract:

- **Inputs (all verified to exist):** seller `outreachStatus`; `checklistProgress` gaps; `nextFollowUpAt`
  (due/overdue); promote-eligibility (`resolveSellerPromotion`, fires only when `QUALIFIED`); data-quality
  flags (`badPhone`/`badEmail`/`doNotCall`); disposition state; for opportunities —
  `evaluateStageMove.suggestedAction`/`missingTruth`/`missingArtifacts`, `summarizeDiligence.missing`,
  closing `blockingItems`, open `Task`s.
- **Output:** a single recommended step + its evidence chain (§5). At most one primary action per entity;
  secondary actions may be listed but not styled as "the" next step.
- **Dependencies:** the inputs above. **No existing next-best-action engine or stored field** — the
  selection is **deterministic synthesis** (pure function of the inputs; no clock/random).
- **Explanation requirements:** every recommendation must cite the source signal(s) that produced it
  (e.g., "checklist 5/5 + QUALIFIED → Promote"; "diligence: rent roll missing → Request rent roll").
- **Uncertainty handling:** when no input yields a clear step, output **"Review"** (a neutral prompt) —
  never a fabricated action.
- **Unavailable states (must be honored):** no motivation score → cannot rank by motivation; no appointment
  model → NBA must not suggest "attend appointment"; no seller-linked tasks → seller NBA cannot draw from
  `Task`.
- **Backend-support ledger (explicit):** every input signal exists individually (BINDABLE); the
  *combination/selection* is SYNTHESIS. This is stated so the build does not mistake synthesis for an
  existing capability.

---

## 8. Missing Information model — four distinct states

The panel must distinguish four states (and preserve the foundation's missing-vs-**negative** distinction):

- **Missing evidence** — a required/expected fact is simply absent (no phone; checklist item not done;
  `PURCHASE_PRICE` unset). *Source:* checklist, `validateAssumptions`, empty fields.
- **Incomplete evidence** — partially present (some checklist items done; diligence partially received;
  a scenario drafted but not locked). *Source:* `checklistProgress` (done<total), `summarizeDiligence`.
- **Conflicting evidence** — contradictory signals (e.g., `QUALIFIED` status but `doNotCall`+`badPhone`;
  a post-contract stage with required diligence still missing). *Source:* **UI synthesis** — the backend
  does not flag conflicts today; this is a deterministic cross-check, and must be labeled as derived.
- **Unavailable evidence** — the capability to know does not exist yet (no motivation score, no confidence
  value, no appointment history). *Rendered as* "not yet available", **distinct** from "missing" (we could
  know but don't).

**Negative information** (known false/blocking: `doNotCall=true`, `badPhone=true`, a disqualifying
disposition) is **not** "missing" — it must be rendered as a known negative, never as a gap to fill.

---

## 9. Backend binding map (grounded in the audited repository)

Per screen: existing service · existing API · existing data · missing backend capability · future
enhancement. Signatures re-verified at `1f19301`.

| Screen | Existing service (verified) | Existing API/route | Existing data | Missing backend | Future enhancement |
|---|---|---|---|---|---|
| Command Center | `getAcquisitionQueue(orgId,now,limit)`, `getDailyAcquisitionMetrics(orgId,startOfDay)`, `getTransactionDashboardRows(orgId,opts)`, BI 5 primitives | server components (no REST needed) | queue, metrics, transaction rows, executed-fee revenue | cross-domain façade; appointments; `Offer` entity; per-period BI | single command-center aggregate; time-windowed BI |
| Seller Work Queue | `getAcquisitionQueue`, `getDailyAcquisitionMetrics` | `/acquire` (exists) | `QueueSeller[]` | motivation/priority score; seller dedup | scored ranking |
| Seller Record | `seller.findFirst`, `sellerQualificationChecklist`, `checklistProgress`, `buildTimeline`, owner services, `commsGate` | `/sellers/[id]`, `/acquire` (exist) | full seller + owner + touches | seller-linked tasks; appointments; general completeness detector; reason enum | richer completeness; call-prep |
| Opportunity Workspace | opportunity `findFirst` includes, `evaluateStageMove`, `moveOpportunityStage`, `summarizeDiligence`, `getClosingGateStatus`, `getActiveScenarioResult` | `/opportunities/[id]` (exists) | opportunity + relations + stage | opportunity-level financials columns; risk score | financials-at-a-glance seam |
| Activity Timeline | `getOpportunityTimeline`, `TransactionTimelinePanel`, `buildTimeline`, `resolveNoteLink` | detail page (exists) | `ActivityLog` | unified cross-entity timeline | widened timeline query |
| Next Best Action | inputs per §7 | none (synthesis) | the input signals | the NBA selection itself | a governed NBA service (later) |
| Missing Information | inputs per §8 | none (synthesis) | checklist/flags/diligence/stage-policy | completeness/confidence score; conflict flags | a completeness engine (later) |

**Hard binding rules:** bind native `OpportunityStage` (not `PipelineFact`/projection — dormant/404);
revenue is all-time (label it); tenant scope is session-derived (never from URL/params — Authority Rule 1).

---

## 10. Role mapping (Milestone 1 restricted to supported roles)

Milestone 1 uses only the **four** roles that exist (`UserRole`: `ADMIN`, `ACQUISITIONS`, `ANALYST`,
`DISPOSITIONS`), enforced by the existing `lib/permissions.ts` matrix.

| Screen | Primary role(s) | Enforcement |
|---|---|---|
| Command Center | all (content varies) | read caps per resource |
| Seller Work Queue / Record | `ACQUISITIONS` (+`ADMIN`) | SELLER read/write caps |
| Opportunity Workspace | `ACQUISITIONS`/`ADMIN`; stage-move policy-gated | `can(...,OPPORTUNITY)` + `canMoveStage` |
| Activity Timeline | all (read) | org-scoped read |

Future roles (Owner/Executive, Acquisition Manager, Underwriter-specific, Buyer/Capital Relations,
Transaction Coordinator) remain **future**. Nav role-tailoring beyond the existing binary ADMIN check is
also future. **No new roles or permissions in Milestone 1.**

---

## 11. Accessibility (planning only)

- **Keyboard navigation:** the seller-queue work loop (open → disposition → next) must be fully
  keyboard-operable; focus order follows reading order; no keyboard traps.
- **Screen-reader:** queues and records use semantic structure and labelled controls; Recommended vs
  Observed distinction must be conveyed non-visually (e.g., accessible labels), not by color alone.
- **Color independence:** status/priority/negative flags carry text or icon, never color-only.
- **Mobile responsiveness:** the queue → record → disposition path is the priority mobile flow (reps work
  from phones); dense analytical surfaces are desktop-first.

*(These are requirements to satisfy at build time; no component design here.)*

---

## 12. Explicit non-goals

No CRM redesign; no backend redesign; no AI redesign; no governance redesign; no authority work; **no BE-3
changes**; **no future workspaces** (Underwriting/Matching/Capital/Communications/Deal Room/Closing/Revenue
stay out of implementation). No new domain models, no new write paths beyond existing ones.

---

## 13. Acceptance questions (for the Review; not build success criteria)

- Can an acquisition representative work the queue efficiently, end-to-end, from Milestone 1 alone?
- Is every recommendation explainable via the evidence chain (§5)?
- Can users distinguish **Observed** facts from **Computed** values and from **Recommended** guidance (§6)?
- Is uncertainty visible — is "not yet scored / not yet available" shown rather than a fabricated value?
- Can an opportunity be understood without visiting multiple pages?
- Are missing inputs immediately visible, and are the four missing-information states (§8) distinguished —
  and never confused with known negatives?
- Does the Command Center avoid implying capabilities that don't exist (appointments, offers queue,
  per-period revenue)?

---

## 14. Information density strategy (added planning guidance)

Each screen classifies every element into one of four visibility tiers, to protect new users without
slowing experts:
- **Always visible:** identity + status + the single Next Best Action + critical negatives (DNC,
  badPhone). The minimum to act.
- **Progressively disclosed:** full qualification checklist, timeline, owner details, diligence summary —
  revealed as the user goes deeper.
- **Expandable (on demand):** the evidence chain behind a recommendation, and the inputs behind a computed
  value (§6 traceability).
- **Expert-only:** raw stage-policy detail (`missingTruth`/`missingArtifacts`), underwriting deep metrics,
  and power-user keyboard actions.

Goal: a new rep sees "who to call and the next step" immediately; an expert reaches full evidence and
controls without extra navigation. (Tier assignment per field is a build-time task; the *strategy* is
fixed here.)

---

## Stop conditions

**Planning only.** Stop after this document for the **UI Milestone 1 Planning Review**. No implementation,
no components, no routes, no APIs, no schema, no mockups. The Milestone-1 build is a **separate, later
authorization**. `civ-1` remains authoritative; BE-3 untouched; no future workspace enters implementation
until Milestone 1 is complete.

---

*Product initiative — planning only. Section 9 verified against `1f19301`. This document selects no
implementation and authorizes none.*
