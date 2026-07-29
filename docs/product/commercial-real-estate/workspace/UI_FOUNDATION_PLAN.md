# Commercial Real Estate Operating Workspace — UI Foundation Plan

> **Status: PLANNING ONLY — for the Commercial Real Estate Operating Workspace — UI Foundation Review.**
> This is a **product** initiative (roadmap), not a governance/language initiative. It follows the same
> governance discipline as BE-3 but lives under `docs/product/commercial-real-estate/` to keep the
> separation explicit. This document defines the operating workspace that lets CRE professionals execute
> the acquisition process **using backend capabilities that already exist**; it selects an
> implementation for **nothing**.
>
> **Not authorized by this document:** code, routes, UI components, schema changes, API changes, UI
> mockups, or any implementation. Sections 2 and 8 are an **evidence-based audit verified against the
> repository at `origin/main` `904a56b`**; no functionality is assumed that is not implemented.

## How to read this document

Every capability is tagged **IMPLEMENTED / PARTIAL / SCAFFOLD (planned) / UNAVAILABLE** with a repository
reference. Where the founder's vision names something the backend does not provide today, this plan says
so plainly and files it as a **future backend gap** — it does not pretend the capability exists and does
not design the fix. The first UI milestone is deliberately scoped to what the backend can serve **now**.

---

## 1. Product vision

**Purpose.** Make the entire commercial real estate acquisition process — from lead source to realized
revenue — understandable, guided, and easy to execute from one interface, on top of the already-governed
backend (seller acquisition, opportunities, the deterministic underwriting kernel, buyer matching, the
closing center, and the business-intelligence primitives).

**Target users (see §3).** Acquisition representatives and managers first; underwriters, dispositions,
and executives thereafter.

**Operating philosophy.** Not a generic CRM. The interface guides the operator through the business
process (§4) and translates backend complexity (scoring, enrichment, governance, projections) into work
queues, guided actions, checklists, recommendations, warnings, evidence, and next steps. The operator
should never need to understand the database, the scoring engine, or the governance architecture.

**Governing UI principle — the four questions.** Every screen should answer:
1. **What is happening?**
2. **What should I do next?**
3. **Why should I do it?**
4. **What information is missing?**

Question 3 ("why") and question 4 ("what's missing") are the ones the current backend supports **only
partially** (see §2, §10, §13); this plan treats closing that gap as a first-class design concern, not an
afterthought.

---

## 2. Existing backend capability audit (evidence-based)

Verified against the repository at `904a56b`. Two calculation engines, ~68 Prisma models, and workspace
routes already exist for most surfaces. Legend: **I** implemented · **P** partial · **S** scaffold/planned
· **U** unavailable.

### 2.1 Seller acquisition
| Capability | State | Evidence |
|---|---|---|
| Lead/seller-source import (background jobs) | **I** | `lib/lead-import-jobs.ts` `queueLeadImportJob`; ADMIN UI `app/(workspace)/settings/imports`. **But import creates Owners/Properties/Opportunities/Notes — not Seller rows**; job state is filesystem-based, not a DB model. |
| Seller CRUD + attribution | **I** | `app/(workspace)/sellers/actions.ts` `createSeller` (requires `acquisitionChannel`); `Seller` model carries immutable channel/campaign/event (Attribution Rule 1). |
| Outreach status + disposition | **I** | `ContactOutreachStatus` ladder; `setSellerOutreachStatus`; `lib/disposition.ts` `DISPOSITIONS`/`dispositionEffect`. |
| Prioritized work queue | **I** | `lib/acquisition-queue.ts` `getAcquisitionQueue` (due/overdue `nextFollowUpAt` first, excludes DEAD/DNC) + `getDailyAcquisitionMetrics`. |
| Qualification checklist / completeness | **P** | `lib/acquisition-checklist.ts` `sellerQualificationChecklist` (5 items) + `checklistProgress`; data-quality flags (`badPhone`, `doNotCall`…). |
| Activity timeline (seller) | **I** | `Seller.activities` (ActivityLog) + unified `lib/comms/timeline.ts` `buildTimeline` (calls+messages+touches+status). |
| Owner/parcel identity + dedup | **I (owners) / U (sellers)** | Owner dedup `lib/intelligence/owner-duplicates.ts`, merge `lib/owners.ts`; `PropertyIdentity` parcel crosswalk. **No seller-level dedup.** |
| Motivation/priority score | **U** | `Seller.motivation` is free text; no numeric score anywhere. |
| Next-best-action recommender | **U** | Only `lib/promote-seller.ts` `resolveSellerPromotion` (fires only when `QUALIFIED`). No per-seller recommended-step engine. |
| Automated parcel/owner enrichment | **S** | External-identifier crosswalks empty pending a provider adapter (`lib/owners.ts` note; `OwnerExternalIdentifier`). |
| Appointments / seller-linked tasks | **U** | No appointment/calendar model; `Task` has no `sellerId`. Only `Seller.nextFollowUpAt` (a single date). |
| Source-quality analytics | **U** | Attribution stored per seller; nothing aggregates channel → volume/qualified/dead. |

### 2.2 Opportunities & pipeline
| Capability | State | Evidence |
|---|---|---|
| Opportunity record + relations | **I (thin financials)** | `Opportunity` model; relations to property/seller/underwriting/closing/escrow/financing/assignment/matches/documents/diligence/tasks/activities. **Only `contractValueUsd`/`assignmentFeeUsd` are first-class money**; occupancy/debt/asking-price/NOI live in the underwriting engine, not on the opportunity. |
| Stage lifecycle | **I** | Native `OpportunityStage` enum (13 stages LEAD→PAID); `moveOpportunityStage`/`evaluateStageMove`; PAID closing gate. |
| Promote qualified seller → opportunity | **I** | `resolveSellerPromotion` + canonical `createOpportunity` (stamps attribution, logs `opportunity.created`). |
| Per-opportunity activity timeline | **I** | `getOpportunityTimeline` + `TransactionTimelinePanel` (already bound on the detail page). |
| Diligence checklist | **I** | `OpportunityDiligenceItem` + `PRECONTRACT_DILIGENCE_TEMPLATE`; `ensureOpportunityDiligence`, `summarizeDiligence`. |
| Pipeline projection / fact layer | **S (dormant, auth-gated)** | `lib/pipeline-*`, `PipelineFact`; routes hardcode 404/`notFound`; **zero live callers**. Do not bind the UI to it. |
| Opportunity next-action / risk | **P/U** | No computed next-action or risk score; `IntelligenceSignal` is OWNER/PROPERTY-only. Implicit signals exist (diligence-missing, closing-blockers, stage-policy `suggestedAction`, open tasks). |

### 2.3 Underwriting & analysis
| Capability | State | Evidence |
|---|---|---|
| Deterministic kernel (NOI, cap rate, DSCR, price/unit, debt sizing, exit/IRR/equity-multiple) | **I** | `lib/analysis.ts` `computeAnalysis` + `lib/underwriting/*`; pure, no clock/random; persisted `ScenarioResult`/`FinancingCaseResult`. |
| Locked scenarios, findings, recommendations, sensitivity | **I** | `ScenarioStatus`, `lockScenario`; `deriveFindings` (observed vs threshold); `SensitivityAnalysis`. |
| Offer memo (from a LOCKED scenario) | **I** | `generateOfferMemo` — immutable SHA-256 snapshot Document; byte-reproducible. |
| Cash-on-cash / break-even occupancy / offer-range (MAO) | **P/U** | Cash-on-cash + MAO only in the **disconnected** ATM calc (`lib/atm-wholesale-calculator.ts`, not persisted); break-even occupancy absent. |
| Per-result formula / per-metric input provenance / completeness / confidence / missing-assumptions | **U** | Assumptions carry provenance at scenario granularity, but there is **no per-metric formula, no per-output input map, no completeness/confidence score, and no missing-assumptions surface** (only `PURCHASE_PRICE>0` is required). |

### 2.4 Buyer & capital matching
| Capability | State | Evidence |
|---|---|---|
| Deterministic match scoring | **I** | `lib/matching.ts` `scoreBuyerForOpportunity` + `MATCH_WEIGHTS` (assetType/state/price/completeness); `generateMatches` upserts `BuyerMatch`. |
| Match status lifecycle | **I** | `MatchStatus` NEW→…→CONFIRMED; `updateMatchStatus` (CONFIRMED auto-advances stage). |
| Buy-box criteria | **P** | `Buyer` has asset types, states, min/max purchase USD only. No unit-range/return-requirement/proof-of-funds/relationship-history. |
| Structured per-criterion explanation | **P** | Scorer emits `reasons[]`/`warnings[]` but only a flattened `thesis` string + total score are persisted. |
| Accept/reject with evidence | **P** | Status flip only; no decision reason/attachment captured. |
| Capital-source matching (lenders, brokers, equity, bridge, transactional, seller-finance) | **U** | No entity/enum types capital sources anywhere. `FinancingCase`/`FinancingRecord` are underwriting/ops, not a capital marketplace. |

### 2.5 Communications
| Capability | State | Evidence |
|---|---|---|
| Call queue (seller) | **I** | `getAcquisitionQueue` (shared with §2.1). |
| Softphone / click-to-call, SMS/email/WhatsApp send | **S / INERT** | Pure reducers + config-gated `sendCommsMessage` (no-op → writes `QUEUED` only); `inertVoiceAdapter`; `/api/comms/voice/token` returns `configured:false`. **No Telnyx adapter exists.** Awaits adapter + `COMMS_ENCRYPTION_KEY`. |
| Contact attempts / scheduled follow-ups | **I** | `recordDisposition` → `ContactTouch`; `Seller.nextFollowUpAt`. |
| Templates / call scripts / transcripts / consent timestamp | **U** | None (email templates cover only system_alert/invitation). `CallRecord` has no transcript and **no write path**. |

### 2.6 Agreements / offers
| Capability | State | Evidence |
|---|---|---|
| Offer memo generation + versioning | **I** | `generateOfferMemo`, append-only `generationSequence`. Internal memo, not a seller-facing contract. |
| Assignment agreement generation | **I** | `generateAssignmentAgreement` / `generateAssignmentDraft`. |
| Counteroffers / e-sign / referral terms / offer expiration | **U** | None (`lib/assignment.ts` explicitly "No e-sign states"). |

### 2.7 Closing
| Capability | State | Evidence |
|---|---|---|
| Checklist snapshot + PAID gate | **I** | `lib/closing-service.ts` `ensureClosingChecklist`, `getClosingGateStatus`; pure `isClosingReady`. |
| Milestone timeline (read model) | **I** | `lib/transaction-dashboard.ts` `selectNextMilestone` (+ overdue flag); `getTransactionDashboardRows`. |
| Escrow / financing / assignment lifecycles | **I** | `EscrowRecord`+`EscrowEvent`, `FinancingRecord`, `AssignmentRecord` with audited transitions. |
| Composite deal-health score | **P/U** | Only readiness summary + next-milestone-overdue; no composite health score. |

### 2.8 Command Center / BI / notifications / roles
| Capability | State | Evidence |
|---|---|---|
| Current dashboard | **I (overview, not a work queue)** | `app/(workspace)/dashboard/page.tsx` — 6 stat cards + recent lists; read-only, not action-oriented. |
| BI primitives (5) | **I** | `lib/business-intelligence`: `revenueByChannel`, `closedWonConversionByChannel`, `buyerCoverageByChannel`, `assignmentRevenueByCampaign`, `revenueByAcquisitionEvent`. Revenue from **executed** `AssignmentRecord` fees (BI Rule 1). **All-time only — no time-window, no funnel, no time-series.** |
| Tasks | **I (generic)** | `Task`: title/status/dueDate/ownerId/opportunityId. **No task type; no seller/buyer/property link.** |
| Notifications | **I (derived)** | ActivityLog vs `lastNotificationsReadAt`; org-wide, not user-targeted. |
| Global activity feed | **I** | `ActivityLog` global + per-entity. |
| Transaction/closing dashboard (at-risk) | **I** | `getTransactionDashboardRows` (overdue-first). |
| Cross-domain "command center" façade | **U** | Each queue lives in a separate module; no single aggregate service. |
| Appointments queue | **U** | No appointment/calendar model. |
| Offers queue | **U** | No `Offer` entity; offers exist only as stages + terminal `AssignmentRecord`. |

### 2.9 Roles & auth
- **4 roles** (`UserRole`): `ADMIN`, `ACQUISITIONS`, `ANALYST`, `DISPOSITIONS`. Capability matrix
  `lib/permissions.ts` (`can(role,action,resource)`); ADMIN-strict checks for merges/waivers/executions.
- **Tenant scope is session-derived** from the authenticated `User.organizationId` — never from URL/header
  (Authority Rule 1 holds); denials audited (`authorization.denied`).
- Nav is **binary role-aware** only (ADMIN sees Settings); no per-role tailoring beyond that.

---

## 3. User roles

The vision names **eight** roles; the system implements **four**. This plan documents the target roles
and maps each to the current model, flagging future work. **No new roles are created by this plan.**

| Target role | Current mapping | Primary workspace | Key decisions | Info needed | Permissions today | Future |
|---|---|---|---|---|---|---|
| Owner / Executive | *(none — use ADMIN)* | Command Center, Revenue | where to invest effort | revenue-by-source, funnel | ADMIN | dedicated exec role + read-mostly views |
| Acquisition Manager | *(none — ADMIN or ACQUISITIONS)* | Command Center, Seller Queue | assignment, prioritization | team queues, source quality | ADMIN/ACQUISITIONS | team-scoped management role |
| Seller Acquisition Rep | `ACQUISITIONS` | Seller Queue, Seller Record | who to call, disposition, promote | next action, follow-ups | SELLER/OPPORTUNITY write | call-prep, appointments |
| Underwriter | `ANALYST` | Guided Underwriting | offer range, findings | scenario inputs, completeness | UNDERWRITING write | per-metric explainability |
| Buyer Relations | `DISPOSITIONS` | Buyer Matching | which buyers to engage | match reasons, buy-box | BUYER write | structured match evidence |
| Capital Relations | *(none)* | Capital Matching | which capital fits | capital-source fit | *(none — unmodeled)* | **net-new domain** |
| Transaction Coordinator | *(none — ADMIN for waivers)* | Closing | milestone/blocker management | checklist, deadlines | CLOSING write (ADMIN-strict waivers) | coordinator role |
| Administrator | `ADMIN` | Settings, all | org/team/config | everything | all | — |

**Gap:** four of eight target roles have no distinct backend role; nav is only ADMIN-aware. Any role
expansion is a separate, later initiative.

---

## 4. Primary workflows

End-to-end business process; each stage lists entry/exit criteria, primary actor, and supporting systems
(with today's backing).

```
Lead Source → Seller Record → Opportunity → Property Research → Qualification →
Outreach → Appointment/Follow-up → Underwriting → Buyer/Capital Matching →
Offer/Agreement → Due Diligence → Closing → Revenue/Performance
```

| Stage | Entry → Exit | Primary actor | Supporting systems (today) |
|---|---|---|---|
| Lead → Seller | import/manual → seller row w/ attribution | Rep/Admin | `createSeller`; **import creates opportunities not sellers (gap)** |
| Seller → Qualification | NEW → QUALIFIED | Rep | `getAcquisitionQueue`, checklist, `setSellerOutreachStatus` |
| Outreach → Appointment | contacted → follow-up scheduled | Rep | `recordDisposition`, `nextFollowUpAt`; **no appointment entity (gap)** |
| Qualified Seller → Opportunity | QUALIFIED → opportunity created | Rep | `resolveSellerPromotion` → `createOpportunity` |
| Opportunity → Underwriting | opportunity → LOCKED scenario | Underwriter | underwriting engine, offer memo |
| Underwriting → Matching | scenario → buyer matches | Buyer Relations | `generateMatches`, `BuyerMatch` |
| Matching → Offer/Agreement | confirmed → agreement drafted | Rep/Coordinator | offer memo, assignment agreement; **no e-sign (gap)** |
| Offer → Due Diligence → Closing | contract → PAID | Coordinator | closing checklist, escrow, financing, PAID gate |
| Closing → Revenue | PAID → executed fee | Executive | BI primitives (executed assignment fees) |

---

## 5. Navigation model

Navigation only — **no component design**. Desktop-first, tablet/mobile responsive.

- **Global navigation** groups (extend the existing shell `components/workspace-shell.tsx`): **Command
  Center**, **Seller Acquisition**, **Opportunities**, **Underwriting**, **Matching**, **Closing**,
  **Insights**, **Settings**. Existing routes already cover most (`/acquire`, `/opportunities`,
  `/analyzer`, `/matches`, `/closing`, `/insights`, `/settings`).
- **Role-aware nav** should consume the `lib/permissions.ts` matrix rather than the current binary
  ADMIN-only check (future refinement; the matrix already exists).
- **Contextual navigation:** within an opportunity, tabs for Overview / Underwriting / Matching / Documents
  / Closing (the detail page already assembles these sections).
- **Work queues** are first-class nav destinations (Seller Queue, At-risk Closings).
- **Search** (existing `/search`) and **notifications** (existing bell, ActivityLog-derived) remain global.
- **Tablet/mobile:** the Seller Queue + Seller Record + call/disposition flow is the priority mobile path
  (reps work from phones); deep analytical surfaces (underwriting, sensitivity) are desktop-first.

---

## 6. Workspace hierarchy

For each: purpose · information · actions · dependencies · future phase. (Milestone-1 members marked ★.)

- **★ Command Center** — landing work-board. Info: seller follow-ups, at-risk closings, revenue,
  opportunities-ready. Actions: jump to queues. Depends: `getAcquisitionQueue`, `getTransactionDashboardRows`,
  BI. Future: appointments/offers queues (need new models).
- **★ Seller Workspace (Queue + Record)** — list-to-conversation execution. Info: queue, record, checklist,
  timeline, owner. Actions: call/disposition/status/promote. Depends: acquisition-queue/checklist/comms
  timeline. Future: motivation score, appointments, call-prep.
- **★ Opportunity Workspace** — single operating record. Info: seller+property+diligence+matches+closing
  cross-links+timeline. Actions: stage move, diligence update. Depends: opportunity detail services,
  `getOpportunityTimeline`. Future: financials-at-a-glance, computed next-action.
- **Guided Underwriting** — sectioned inputs → metrics. Depends: underwriting engine. Future: per-metric
  formula/provenance/completeness (all absent today).
- **Buyer Matching** — match review. Depends: `matching.ts`, `BuyerMatch`. Future: structured per-criterion
  evidence.
- **Capital Matching** — capital-source fit. Depends: **net-new domain (unmodeled)**. Future: entire model.
- **Communications** — daily console. Depends: comms (INERT until Telnyx adapter + `COMMS_ENCRYPTION_KEY`).
- **Deal Room** — controlled document space. Depends: `Document`. Future: room/stage grouping, statuses.
- **Closing** — milestone management. Depends: closing/escrow/financing/assignment. Future: composite
  health score.
- **Revenue** — source-to-revenue. Depends: BI primitives. Future: funnel + time-windows.

---

## 7. Milestone 1 (most important section)

Milestone 1 turns the existing seller-acquisition engine into a daily-operable product. **Implementation
is limited to:** Command Center · Seller Work Queue · Seller Record · Opportunity Workspace · Activity
Timeline · Next Best Action · Missing Information panel. **Everything else in §6 remains future.**

Milestone 1 is deliberately a **read-and-guide layer over already-governed records** — it introduces no
new authority, no new write paths beyond those that already exist, and no new domain models. Its two
genuinely new UI constructs — **Next Best Action** and **Missing Information** — are **deterministic
syntheses over existing facts**, not new scoring engines (see §8, §10, §13).

Milestone-1 scope guards:
- Bind to the **native `OpportunityStage`**, never the dormant pipeline projection.
- Use **`Seller.nextFollowUpAt`** for "follow-ups due"; do **not** imply true appointments (no model).
- Command Center **orchestrates existing services** (`getAcquisitionQueue`, `getTransactionDashboardRows`,
  BI) — a thin read façade, not a new aggregate store.
- Revenue shown is **all-time** (BI has no time-window yet) and must be labeled as such.

---

## 8. Backend capability mapping (Milestone-1 screens) — evidence-verified

For each screen: services used · data available · evidence available · **gaps** · **assumptions
prohibited**. Verified at `904a56b`.

**Command Center**
- Services: `getAcquisitionQueue`, `getDailyAcquisitionMetrics`, `getTransactionDashboardRows`,
  `revenueByChannel`/`assignmentRevenueByCampaign`, notifications, activity feed.
- Available: sellers-needing-follow-up (ready), at-risk closings (overdue milestone), all-time revenue,
  opportunities-ready (derivable from `stage`).
- Gaps: **no appointments queue** (no model), **no offers queue** (no `Offer` entity), **no cross-domain
  façade** (must orchestrate), BI is all-time only.
- Assumptions prohibited: do not assume an appointment model, an offer object, a per-period revenue query,
  or a single command-center service exist.

**Seller Work Queue**
- Services: `getAcquisitionQueue`, `getDailyAcquisitionMetrics`, status options/tones, row actions
  (`setSellerOutreachStatus`, `recordDisposition`, `logContactTouchAction`, `resolveSellerPromotion`).
- Available: prioritized (date-based) queue, daily metrics, disposition flow.
- Gaps: **no motivation/priority score** (queue is date-only), **no seller dedup**.
- Assumptions prohibited: do not assume a ranking score or dedup surface exist.

**Seller Record**
- Services: `seller.findFirst` (existing includes), `sellerQualificationChecklist`/`checklistProgress`,
  `buildTimeline`, owner link services.
- Available: full seller fields, 5-item checklist + data-quality flags, unified timeline, owner panel.
- Gaps: completeness is fixed to 5 checklist items; **no structured disqualification reasons**; **no
  seller-linked tasks/appointments**.
- Assumptions prohibited: do not assume a general missing-field detector, appointment booking, or a
  reason enum exist.

**Opportunity Workspace**
- Services: `opportunity.findFirst` (detail-page include), `STAGE_OPTIONS`/`moveOpportunityStage`/
  `evaluateStageMove`, `summarizeDiligence`, `getActiveScenarioResult` (reference), `BuyerMatch`,
  `getClosingGateStatus`.
- Available: seller+property+diligence+matches+closing cross-links, stage control with policy checks.
- Gaps: **thin financials on the opportunity** (rich figures only via the underwriting engine), **no
  computed next-action/risk**.
- Assumptions prohibited: do not assume opportunity-level financials columns, a risk score, or a
  next-action field exist; do not bind to `PipelineFact`/projection (dormant/404).

**Activity Timeline**
- Services: `getOpportunityTimeline` + `TransactionTimelinePanel`; `buildTimeline` for seller.
- Available: per-opportunity and per-seller timelines already bound.
- Gaps: opportunity-scoped timeline shows only events carrying `opportunityId`; seller/property-only
  events won't appear unless the query is widened.
- Assumptions prohibited: do not assume a unified cross-entity timeline exists without widening the query.

**Next Best Action** *(new UI construct — synthesis only)*
- Inputs available: checklist gaps (`checklistProgress`), follow-up-due (`nextFollowUpAt`),
  promote-eligibility (`resolveSellerPromotion`), diligence-missing (`summarizeDiligence`),
  closing-blockers (`blockingItems`), stage-policy (`evaluateStageMove.suggestedAction`), open tasks.
- Gaps: **there is no next-best-action engine or field.** The panel must deterministically derive a
  recommended step from the above signals.
- Assumptions prohibited: do not assume a recommender, an action ranking, or a stored next-action exist.

**Missing Information** *(new UI construct — synthesis only)*
- Inputs available: qualification checklist, data-quality flags, diligence status, closing blockers,
  underwriting `validateAssumptions` (`PURCHASE_PRICE` only).
- Gaps: **no general completeness/confidence score** on any domain; underwriting has no missing-assumptions
  surface.
- Assumptions prohibited: do not assume a completeness score, confidence value, or missing-field engine
  exist; the panel binds only to the concrete signals above.

---

## 9. UI principles

- **Action-oriented** — queues and next steps over decorative charts.
- **Evidence before recommendation** — never show a recommendation without the evidence behind it (§13).
- **Progressive disclosure** — guided flow first; power-user density on demand.
- **Explain every score** — where a score exists (match score, findings), show its basis; where it does
  **not** (motivation, confidence), say "not yet scored" rather than invent one.
- **Never hide uncertainty** — surface ambiguity and missing data explicitly (consistent with the
  governance philosophy).
- **Guided workflow** — beginner path and efficient power-user path coexist.
- **Keyboard efficiency**, **accessibility** (WCAG-aware), **mobile awareness** (seller queue/call flow
  works on phones; deep analytics desktop-first).

---

## 10. Information completeness

Define four distinct states the UI must represent, and one distinction the backend does **not** currently
make:
- **Complete** — required inputs present.
- **Missing information** — a required/expected input is absent (e.g., no phone, checklist item undone,
  `PURCHASE_PRICE` unset). Bindable from checklist, data-quality flags, diligence, `validateAssumptions`.
- **Blocker** — something prevents progress (closing `blockingItems`, PAID gate, stage-policy
  `missingTruth`/`missingArtifacts`).
- **Confidence** — how reliable the current picture is. **No numeric confidence exists today**; the UI
  should show "not yet scored" rather than fabricate one.

**Critical distinction (design requirement):** separate **missing information** (we don't know) from
**negative information** (we know it's absent/false — e.g., `doNotCall = true`, `badPhone = true`, a
disqualifying disposition). The backend encodes several negatives as explicit booleans/statuses; the UI
must not render a known negative as a mere gap.

---

## 11. Explicit non-goals

- Not a generic CRM.
- No backend redesign; no schema/API changes in this plan.
- No automation redesign; no governance redesign; no AI redesign.
- No authority changes; **no BE-3 modifications** (civ-1 remains authoritative; language governance
  untouched).
- Milestone 1 introduces no new domain models and no new write paths beyond those that already exist.

---

## 12. Acceptance questions (for the UI Foundation Review; not implementation success criteria)

- Can a seller acquisition representative complete a full day's work from Milestone 1 alone?
- Does every seller record present a clear, correct **next action** — synthesized from real signals?
- Can an opportunity be understood without opening multiple screens?
- Are **missing inputs** obvious, and clearly distinguished from **negative information**?
- Are recommendations **explainable** — is the supporting evidence always shown (§13)?
- Does the Command Center orchestrate existing services without implying capabilities that don't exist
  (appointments, offers queue, per-period revenue)?
- Where a capability is a **gap** (motivation score, next-action engine, appointments), does the plan
  surface it honestly rather than assume it?

*(Implementation success criteria are deferred to the Milestone-1 build initiative.)*

---

## 13. Workspace evidence model (operational alignment)

Because this product is fundamentally operational, **every UI recommendation must be presented as an
evidence chain**, never as a bare directive:

```
Recommendation → Supporting evidence → Missing evidence → Confidence → Next action
```

- **Recommendation** — the guided step (e.g., "Promote to opportunity", "Call owner", "Request rent
  roll").
- **Supporting evidence** — the concrete facts behind it (checklist complete, `QUALIFIED` status,
  diligence received, a finding's observed-vs-threshold, a match's reasons).
- **Missing evidence** — what is absent that would raise confidence (unset assumptions, incomplete
  checklist, no contact made).
- **Confidence** — qualitative today ("high/medium/low" derived from completeness), explicitly **"not yet
  scored"** where no numeric basis exists — never fabricated.
- **Next action** — the single most useful step, from the Next-Best-Action synthesis (§8).

This keeps the interface aligned with the governance philosophy already established: evidence before
recommendation, and uncertainty surfaced rather than hidden. The model is a **UI contract**; where the
backend cannot yet supply an element (confidence score, per-metric provenance), the UI states that plainly
rather than implying certainty.

---

## Stop conditions

**Planning only.** Stop after this document for the **Commercial Real Estate Operating Workspace — UI
Foundation Review**. No implementation, no components, no schema, no APIs, no mockups. The first
implementation (Command Center + Seller Work Queue + Seller Record + Opportunity Workspace + Activity
Timeline + Next Best Action + Missing Information) is a **separate, later authorization**.

---

*Product initiative — planning only. Sections 2 and 8 are verified against `904a56b`. This document
selects no implementation and authorizes none.*
