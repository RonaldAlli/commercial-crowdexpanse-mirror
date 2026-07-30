# CRE Operating Workspace — UI Milestone 2 Planning

> **Status: PLANNING ONLY — NOT ACCEPTED, NOT IMPLEMENTATION.** Governed decision "UI Milestone 2
> Planning — In Progress (Planning Only)". Baseline: released production `main 3263b44` (post-M1 +
> global-nav + repo maintenance). Method: **M1 audit as authoritative baseline + targeted spot-checks;
> document only verified deltas.** No code, schema, API, deployment, or backend initiative. Deliverable is
> a planning package for founder review; the choice of Milestone 2 is decided **at the review gate from
> evidence**. Context: `UI_MILESTONE_1_ACCEPTANCE.md`, `UI_FOUNDATION_PLAN.md`, [[crowdexpanse-cre-workspace]].

---

## 1. Backend Capability Verification (spot-check deltas vs the M1 audit)

**Verification basis.** Git-level proof that domain authority is unchanged since the M1 audit baseline
(`904a56b` → `3263b44`): **0 changes under `prisma/`**, **0 changes under `app/api/`**; the only `lib/`
additions are the M1 `lib/workspace-ui/*` presentation layer and BE-3 lint fixes. Therefore the M1
capability map stands as the baseline and is **not re-derived**; only verified deltas are recorded below.

### 1a. "No change" — carried forward from the M1 audit (still authoritative)
Seller acquisition queue, Seller record + qualification checklist, Opportunity detail + native
`OpportunityStage` (13 stages LEAD→PAID) + `moveOpportunityStage`/`evaluateStageMove`, activity timeline
(`getOpportunityTimeline`/`TransactionTimelinePanel`), closing gate + transaction dashboard, BI revenue
primitives, buyer matching (`lib/matching.ts`, `MATCH_WEIGHTS` @15, `scoreBuyerForOpportunity` @52),
session-derived tenant scope (Authority Rule 1), 4-role RBAC (`lib/permissions.ts`). **No change.**

### 1b. VERIFIED DELTAS — corrections/additions to the M1 planning notes

**D-1 (material). The Underwriting domain is far more mature and fully wired than the M1 notes implied.**
The M1 notes characterized underwriting as "kernel `lib/analysis.ts`; no per-metric provenance/completeness
surface; cash-on-cash + MAO only in a disconnected ATM calc." Spot-checks show a **complete, governed,
versioned underwriting subsystem** (all present at the M1 baseline too — this corrects the *notes*, not code):
- **Models** (`prisma/schema.prisma`): `Underwriting` @1347 (per-opportunity, `activeScenarioId`),
  `UnderwritingScenario` @1366 (versioned: `modelVersion`/`calcLibVersion`/`rulesetVersion`/`scenarioVersion`,
  `status: ScenarioStatus` DRAFT→…, `lockedAt`, `supersededById`, `analystSummary`), `UnderwritingAssumption`
  @1402 (**per-assumption provenance: `source: AssumptionSource`, `sourceField`, `sourceAsOf`** — directly
  contradicts the "no provenance" note), `UnderwritingDecision` @1577 (**decision/approval workflow**:
  `decision: UnderwritingDecisionLevel`, `rationale`, `suggestedLevel` = the engine's recommendation captured
  *for contrast with the human decision*, `actorUserId`, ordered `sequence`), plus `ScenarioResult`,
  `ScenarioLineItem`, `ScenarioFinding`, and the `FinancingCase`/`FinancingAssumption`/`FinancingCaseResult`
  family (@1475–1521) for debt scenarios.
- **Engine** (`lib/underwriting/`): `assumptions.ts`, `cash-flow.ts`, `debt-sizing.ts`, `exit.ts`,
  `findings.ts`, `sensitivity.ts`, `scenario-result.ts`, `schedule.ts`, `model-version.ts`, `financing.ts`
  — deterministic, versioned. Plus `lib/underwriting.ts`, `lib/analysis.ts`, `lib/financing-service.ts`.
- **UI already live**: `/analyzer`, `/analyzer/[opportunityId]`, `/analyzer/[opportunityId]/compare`
  (scenario comparison), `/analyzer/[opportunityId]/edit`, `/analyzer/atm-wholesale` (+ `analyzer/actions.ts`).
- **Authorization**: `UNDERWRITING` = write [ADMIN, ANALYST], read [ACQUISITIONS, DISPOSITIONS];
  `UNDERWRITING_APPROVAL` = write [ADMIN, ACQUISITIONS, DISPOSITIONS], read [ANALYST] (separation of duties —
  ANALYST authors, others approve); `DEAL_ANALYSIS` = write [ADMIN, ANALYST], read [ACQUISITIONS, DISPOSITIONS].

**Consequence of D-1:** underwriting is a **missing-presentation/orchestration** problem, not a
missing-authority one. A "Guided Underwriting" workspace would compose an *existing, governed, versioned*
engine + decision workflow into the operator experience — the exact M1 façade pattern.

**D-2 (confirmed gaps — no change).** No `Appointment`/`Calendar` model (absent). No first-class `Offer`
entity (offers = `OpportunityStage` progression + terminal `AssignmentRecord` @2071). `Task` @1764 has
`opportunityId` + `ownerId` but **no `sellerId`** (seller-linked tasks remain a gap). No buyer-side
**capital-source** model (`CapitalSource`/`Lender`/`Fund` absent; the `Financing*` models are
underwriting/closing debt structures, not investor/LP capital).

---

## 2. Gap Analysis  (missing **authority** vs missing **presentation**)

The single most decision-relevant distinction (per founder): a gap is either **missing backend authority**
(needs a backend initiative before any UI) or **missing presentation** (the authority exists; it's a UI/
orchestration build — safe under the M1 pattern).

| Domain | Backend authority | UI / presentation | Operational | Classification |
|---|---|---|---|---|
| **Underwriting** | Exists & wired (models, engine, decision workflow, provenance) | Analyzer exists but is a *tool*, not a guided operator workspace; no evidence-chain / missing-assumption synthesis / decision surfacing integrated into the Opportunity flow | Engine deterministic, versioned | **Missing presentation** |
| **Buyer/Capital Matching** | Buyer + `BuyerMatch` + `scoreBuyerForOpportunity` exist; **buyer-side capital-source modeling absent** | `/matches`, `/buyers` exist; no capital/LP surface; match persists flattened thesis+score (no structured per-criterion) | — | **Mixed: matching = presentation; capital sourcing = missing authority** |
| **Deal Room** | `Document` @1807, generated agreements, offer-memo snapshot exist; no collaboration/threading model | `/documents` exists; no per-deal shared room | — | **Mixed (core exists; collaboration = missing authority)** |
| **Closing** | Mature: `lib/closing-service.ts`, `lib/transaction-dashboard-service.ts`, diligence, escrow/financing/assignment resolution | **v1.4 Closing Center already substantial**; a workspace would be re-presentation/orchestration | — | **Missing presentation (largely already built)** |
| **Revenue** | BI primitives exist but **all-time only** (no funnel / time-window / period) | `/insights` source performance exists | — | **Mixed (read-only exists; funnel/period = missing authority)** |
| **Appointments / seller-tasks** | **Absent** (no model; `Task` lacks `sellerId`) | — | scheduling is net-new | **Missing authority** |

---

## 3. Candidate Workspace Evaluation

Scored 1–5 (5 = best/most-ready). "Backend readiness" dominates because M1 proved the façade pattern only
works over existing authority.

| Candidate | Business value | Backend readiness | Workflow impact | Dependencies | Complexity (lower=simpler) | Notes |
|---|---|---|---|---|---|---|
| **Guided Underwriting** | 5 | **5** | 5 | none (engine+decision workflow live) | 3 | Sits directly downstream of the released Opportunity Workspace; presentation/orchestration of a governed engine |
| **Closing Workspace** | 4 | 5 | 3 | none | 2 | Mostly re-presentation of the existing v1.4 Closing Center — lower marginal value (already usable) |
| **Revenue Workspace** | 4 | 3 | 3 | funnel/time-window BI (backend) | 3 | Read-only slice buildable now; funnel/period is a backend initiative first |
| **Buyer/Capital Matching** | 4 | 2 | 4 | capital-source model (net-new backend) | 4 | Matching UI buildable; capital sourcing blocked on missing authority |
| **Deal Room** | 3 | 2 | 3 | collaboration model (net-new) | 4 | Document core exists; the "room" (sharing/threading) is net-new authority |

---

## 4. Dependency Map

- **Must precede UI (backend initiatives):** capital-source modeling (Buyer/Capital Matching); collaboration/
  sharing model (Deal Room); funnel/time-window BI (Revenue full); appointment/calendar model + `Task.sellerId`
  (scheduling / seller-tasks).
- **Immediately buildable on existing authority (M1 façade pattern):** **Guided Underwriting** (engine +
  decision workflow live); **Closing Workspace** (Closing Center services live); a **read-only Revenue slice**
  (all-time BI); the **matching-only** portion of Buyer/Capital Matching (excluding capital sourcing).
- **Deferred:** capital sourcing, Deal Room collaboration, appointments, seller-tasks, structured
  per-criterion match reasoning — each pending its own backend decision.

**Rule honored:** do not invent UI that lacks backend authority. The immediately-buildable set is exactly
the set with existing authoritative backends.

---

## 5. Milestone Recommendation

**Recommended Milestone 2: Guided Underwriting Workspace.**

**Why (evidence, not assumption):** highest business value *and* highest backend readiness of the five
candidates; it is the deterministic operating layer directly downstream of the released Opportunity Workspace
and upstream of Deal Room / Closing / Revenue (founder's hypothesis, now evidence-supported). Spot-check D-1
shows the authority already exists — versioned scenarios, per-assumption provenance, and a
decision/approval workflow — so M2 is a **governed presentation/orchestration** build (the proven M1 pattern),
not a backend initiative. Closing is also backend-ready but lower marginal value (already substantially built);
Revenue/Matching/Deal Room each carry a missing-authority dependency that would force a backend initiative first.

**Proposed objective.** A guided, evidence-driven underwriting operator surface that composes the existing
underwriting engine + scenario/decision models into the Opportunity flow: shows the active scenario's computed
metrics with Observed/Computed/Recommended taxonomy, surfaces missing assumptions (4-state Missing-Info) with
their provenance, presents the engine's recommendation *and* the human decision workflow (respecting
`UNDERWRITING_APPROVAL` separation of duties), and deep-links from the Opportunity Workspace — adding **no new
underwriting authority**.

**Proposed increments (governed, each independently reviewable):**
1. Underwriting capability re-verification + read-only scenario/result presentation (bind existing engine
   output; O/C/R taxonomy; evidence chain) — no writes.
2. Missing-assumption synthesis (4-state) over `UnderwritingAssumption` provenance — advisory only.
3. Decision surfacing: show engine `suggestedLevel` vs `UnderwritingDecision`, respecting approval RBAC —
   read + record via *existing* decision authority only.
4. Opportunity Workspace integration (deep-link, next-best-action tie-in) + accessibility/responsive +
   milestone verification (isolated Playwright).

**Proposed acceptance criteria.** No new schema/API/authority; underwriting engine byte-unchanged;
per-increment additive; tenant scope session-derived; separation-of-duties preserved; O/C/R + Missing-Info +
evidence-chain contracts honored; unit/contract + isolated browser verification green.

**Proposed release criteria.** Accepted → frozen → RC dry-run → D25 deploy → production verification
(authed render of the guided-underwriting surface; existing analyzer routes healthy; landing unchanged; logs
clean) → release record → **discoverability** (nav entry if warranted) — the full governed lifecycle.

---

## 6. Acceptance questions for the review gate

1. Confirm **Guided Underwriting** as Milestone 2 (vs Closing as an alternative backend-ready option)?
2. Should the Guided Underwriting workspace **reuse/absorb the existing `/analyzer`** surface, or sit beside
   it as a distinct guided workspace that deep-links into the analyzer?
3. Is surfacing the **decision/approval workflow** (increment 3) in scope for M2, or deferred to keep M2
   read-first?
4. Confirm the **backend-initiative gaps** (capital-source, collaboration, funnel BI, appointments,
   `Task.sellerId`) are explicitly *out* of M2 and each requires its own governed decision.
5. Any candidate to promote/demote given the evidence (e.g., a read-only Revenue slice as a smaller M2)?

**Next step:** founder review of this planning package. **No implementation until accepted.**
