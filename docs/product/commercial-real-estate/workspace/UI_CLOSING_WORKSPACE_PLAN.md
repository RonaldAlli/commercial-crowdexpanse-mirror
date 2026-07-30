# CRE Operating Workspace — Closing Workspace — Planning Package

> **Status: PLANNING ONLY — NOT ACCEPTED, NOT IMPLEMENTATION.** Governed decision "Closing Workspace —
> APPROVED TO PLAN". Audited against verified `main d3caf4f`. No code, schema, API, or deployment. Operator
> question: **"Can this transaction be closed, and what is preventing it from closing?"** Deliverable for
> founder review; recommendation at the end. Honors the four standing contracts. Context:
> `UI_MILESTONE_2_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## 1. Backend capability audit (verified, not assumed)

**Method:** direct code inspection at `main d3caf4f`. Classification per capability: **Authoritative** /
**Partial** / **Missing**.

### Models (Authoritative)
`ClosingChecklist` (@schema 1905) → `ClosingChecklistItem` (@1925): `category`, `label`, `required`, `status`
(`ChecklistItemStatus`), **`ownerId`**, **`dueDate`**, `completionEvidenceType`. `ClosingChecklistTemplate`/
`…Item` (seed). `EscrowRecord` (@1960): `status` (`EscrowStatus`), holder, `resolutionReason`, `+EscrowEvent`.
`FinancingRecord` (@2021): `status` (`FinancingStatus`), lender, resolution snapshots. `AssignmentRecord`
(@2071): `status` (`AssignmentStatus`), assignee, resolution. `OpportunityDiligenceItem` (@1226).

### Services & pure projections (Authoritative, read-only available)
- `lib/closing.ts` (pure): `isClosingReady`, `blockingItems`, `closingProgress`, **`closingReadinessSummary`**
  → `{ready, requiredTotal, requiredSatisfied, outstandingCount, blockMessage}`; `isValidStatusTransition`.
- `lib/closing-service.ts`: `getClosingGateStatus` (@120) → `{ready, blockingLabels, message}`;
  `getClosingChecklist` (@100); mutating item ops (`completeChecklistItem`, `waiveChecklistItem`,
  `setItemOwner`, `setItemDueDate`, …). **Caveat:** `ensureClosingChecklist` (@53) **materialises on read** —
  see Risk R3 / OB-2.
- `lib/transaction-dashboard.ts` (pure, no clock/IO): `TransactionProjectionInput` (opportunity + escrow +
  financing + assignment + checklist), `DashboardChecklistItem` (label, `dueDateMs`, **`ownerName`**),
  `milestoneCandidates` + **`selectNextMilestone`** → `NextMilestone {label, dateIso, overdue}`.
- Per-domain reads: `getEscrowRecord`, `getFinancingRecord`, `getAssignmentRecord`, `getClosingChecklist`,
  `getTransactionDashboardRows`, `getOpportunityTimeline`. Status label/tone helpers per domain.

### Authorization (Authoritative)
`CLOSING` = write [ADMIN, ACQUISITIONS, DISPOSITIONS], read [ANALYST] (lib/permissions.ts:93). ADMIN-only
resolve gates: `canWaiveClosingItem`, `canResolveEscrow`, `canResolveFinancing`, `canExecuteAssignment`.

### Verdict
**The closing backend is fully authoritative and wired** (v1.4 Closing Center). Every value the workspace
needs — readiness, blockers, per-domain status, item owner, next milestone — is already derivable read-only.
**No partial or missing backend authority was found for the operator question.**

## 2. Current UI audit

| Surface | What it is | Classification |
|---|---|---|
| `/closing` (`getTransactionDashboardRows`) | Transaction Dashboard across **all** in-flight deals; readiness + per-domain chips; filters; read-only derived | **Operator overview (all-deals dashboard)** |
| `/opportunities/[id]` | Per-deal **console**: `ClosingChecklist` + `EscrowCard`/`FinancingCard`/`AssignmentCard` with **actions** (complete/waive/resolve/execute) + timeline | **Engineering/operator console** (mutating; authoritative for closing work) — analogous to `/analyzer` |
| Opportunity Workspace → "Closing gate" section (`closingGateView`) | A closing **signal** (ready + blocker labels) + link | **Operator signal, not a workspace** |
| Components (`closing-checklist`, `escrow/financing/assignment-card`, `transaction-row`, `closing-badges`, `transaction-timeline-panel`) | Reusable presentation | Utility |

## 3. Gap analysis (verified only)

- **Existing authority:** readiness, blockers, per-domain status, item owner (`ownerId`→`ownerName`), next
  milestone, timeline, permissions — all present.
- **Existing UI:** all-deals dashboard (`/closing`); per-deal closing **console** (`/opportunities/[id]`);
  closing **signal** in the Opportunity Workspace.
- **Missing UI:** a per-opportunity, operator-facing **Closing Workspace** that answers *"Can this deal close
  & what's preventing it?"* answer-first (readiness → blockers → owners → next step → deep-link to the console).
- **Missing backend:** **none** for the operator question.
- **Deferred:** OB-2 (mutate-on-GET) is inherited, not owned by this workspace (Risk R3).

**Net:** like Guided Underwriting, this is a **missing-presentation** gap, not a missing-authority one.

## 4. Operational-question mapping (minimum workspace)

| Question | Existing source (read-only) |
|---|---|
| **Can this close?** | `closingReadinessSummary` (ready · requiredSatisfied/requiredTotal · blockMessage) |
| **What is blocking closing?** | `blockingItems` (checklist) **+** `EscrowRecord`/`FinancingRecord`/`AssignmentRecord` `.status` (unresolved domains) |
| **Who owns the blocker?** | `ClosingChecklistItem.ownerId` → `ownerName`; escrow holder / lender / assignee for domain blockers |
| **What happens next?** | `selectNextMilestone` (`NextMilestone` label/date/overdue) + outstanding items' owners/due dates |

## 5. Candidate workspace structure (read-first façade; the M1/M2 pattern)

Route: `/closing-workspace/[opportunityId]` (read-only, tenant-scoped, `notFound` on miss), sections in order:
1. **Executive Closing Summary (answer first)** — Closeable: Yes / Not yet (from `closingReadinessSummary`);
   headline blocker count + `blockMessage`; **information quality**: readiness is the **checklist gate**, with
   escrow/financing/assignment resolution shown distinctly (do not overstate "closeable" if domains unresolved).
2. **What is blocking?** — outstanding checklist items (persisted order) + unresolved domain statuses; four-
   state honesty where evidence is absent.
3. **Who owns it & what's next?** — owner + due date per blocker; `selectNextMilestone` (overdue flagged).
4. **Timeline** — reuse `TransactionTimelinePanel` (chronological; never reordered — Decision-Chronology
   contract).
5. **Do the work → Closing console** — prominent deep-link to `/opportunities/[id]` (authoritative for
   checklist/escrow/financing/assignment actions). The workspace itself performs **no** closing mutations.

## 6. Workspace boundaries (Phase 5)

- **Opportunity Workspace** — *"Should we pursue this opportunity?"* (keeps only a closing **signal** + link).
- **Guided Underwriting** — *"Can we structure this deal?"*
- **Closing Workspace (new)** — *"Can we close this, and what's preventing it?"* (per-deal operator façade).
- **`/opportunities/[id]` console** — where closing **work** happens (like `/analyzer` for underwriting):
  authoritative for edits; the Closing Workspace deep-links into it and never duplicates its controls.
- **`/closing` dashboard** — the **all-deals** overview; the workspace is the **single-deal** answer.

## 7. Dependency map

- **Must precede UI:** none — backend authority is complete.
- **Immediately buildable on existing authority (façade pattern):** the Closing Workspace read-first surface.
- **Deferred / separate:** OB-2 mutate-on-GET evaluation; any new "holistic close readiness" that unifies the
  checklist gate with escrow/financing/assignment resolution into one backend signal (only if founder wants a
  single composite gate — currently readiness = checklist gate, domains shown alongside).

## 8. Risks

- **R1 — duplication of the console.** `/opportunities/[id]` already shows everything editable. *Mitigation:*
  the workspace is read-first + answer-first and deep-links to the console for all actions; it renders no
  editing controls.
- **R2 — surface proliferation.** Closing already appears in 3 places (dashboard, console, Opportunity-Workspace
  signal). A 4th per-deal surface risks operator confusion. *Mitigation:* strict boundary (§6) — the workspace
  is THE per-deal "can we close?" answer; dashboard = all deals; console = the work. Recommend the Opportunity
  Workspace's closing signal deep-link INTO the Closing Workspace (progression), not compete with it.
- **R3 — OB-2 inheritance (mutate-on-GET).** Reading `getClosingGateStatus`/`getClosingChecklist` triggers
  `ensureClosingChecklist` (materialise-on-read). *Mitigation:* prefer a non-materialising read for the
  workspace, or explicitly accept the inherited pre-existing behavior and tie it to OB-2; decide at increment
  planning. Do NOT change the pattern inside this initiative unless proven a defect.
- **R4 — meaning of "closeable".** `getClosingGateStatus.ready` is the **checklist** gate; full close also
  needs escrow/financing/assignment resolution. *Mitigation:* the Executive Summary must present the checklist
  gate and domain resolution **distinctly** (Information-Quality contract) — never imply "closeable" when a
  domain is unresolved.

## 9. Recommendation

**READY TO IMPLEMENT.** The closing backend is fully authoritative; the Closing Workspace is a read-first
operator façade over existing authority — the proven Milestone-1 / Guided-Underwriting pattern — answerable
end-to-end from existing reads, with **no backend initiative required**. Proceed under the same governed model
(bounded increments, per-increment authorization, then the full Accepted → Released lifecycle), honoring the
four standing contracts and managing R1/R2/R4 as first-class design constraints and R3 (OB-2) as an explicit
increment-planning decision.

**Stop point:** planning complete. Awaiting founder review. No implementation, no Increment 1, no design
freeze, no production changes.
