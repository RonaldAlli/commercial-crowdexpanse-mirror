import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { NotesSection } from "@/components/notes-section";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StageSelect } from "@/components/stage-select";
import { Badge, statusTone } from "@/components/ui/badge";
import { GenerateMatchesButton, MatchRowControls } from "@/components/match-controls";
import { ClosingChecklist, StartClosingChecklistButton, type ChecklistItemView } from "@/components/closing-checklist";
import { EscrowCard, type EscrowView } from "@/components/escrow-card";
import { FinancingCard, type FinancingView, type FinancingUnderwritingRef } from "@/components/financing-card";
import { AssignmentCard, type AssignmentView, type AssignmentDraft } from "@/components/assignment-card";
import { AccordionSection } from "@/components/accordion-section";
import { requireUser } from "@/lib/auth";
import { can, canMoveStage, canWaiveClosingItem, canResolveEscrow, canResolveFinancing, canExecuteAssignment } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { blockingItems, closingProgress, closingReadinessSummary } from "@/lib/closing";
import { escrowStatusLabel, escrowStatusTone } from "@/lib/escrow";
import { financingStatusLabel, financingStatusTone } from "@/lib/financing";
import { assignmentStatusLabel, assignmentStatusTone } from "@/lib/assignment";
import { getClosingChecklist } from "@/lib/closing-service";
import { getEscrowRecord } from "@/lib/escrow-service";
import { getFinancingRecord } from "@/lib/financing-service";
import { getAssignmentRecord } from "@/lib/assignment-service";
import { getOpportunityTimeline } from "@/lib/transaction-timeline-service";
import { TransactionTimelinePanel } from "@/components/transaction-timeline-panel";
import { listGeneratedAgreements } from "@/lib/documents/assignment-agreement-service";
import { getActiveScenarioResult } from "@/lib/underwriting";
import { checklistCategoryLabel } from "@/lib/closing-options";
import { matchStatusLabel, matchStatusTone } from "@/lib/match-options";
import { STAGE_OPTIONS, stageLabel } from "@/lib/opportunity-options";
import { titleCase } from "@/lib/property-options";

import { deleteOpportunity, moveOpportunityStage } from "../actions";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  return value == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tlorder?: string; tlpage?: string };
}) {
  const user = await requireUser();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      property: { select: { id: true, name: true, city: true, state: true, assetType: true } },
      seller: { select: { id: true, name: true } },
    },
  });

  if (!opportunity) {
    notFound();
  }

  const matches = await prisma.buyerMatch.findMany({
    where: { opportunityId: opportunity.id, organizationId: user.organizationId },
    include: { buyer: { select: { id: true, name: true, company: true } } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
  });

  // Transaction Timeline (TX-0) — read-only chronological projection of this deal's recorded
  // events; newest/oldest + page are driven by GET params (no client JS, no writes).
  const timelineOrder = searchParams?.tlorder === "oldest" ? "oldest" : "newest";
  const timelinePage = Math.max(1, Number.parseInt(searchParams?.tlpage ?? "1", 10) || 1);
  const timeline = await getOpportunityTimeline(user.organizationId, opportunity.id, { order: timelineOrder, page: timelinePage });

  // Closing Center (v1.4). Read-only here — we never instantiate on view; a
  // CLOSING-write user starts the checklist explicitly (StartClosingChecklistButton).
  const closing = await getClosingChecklist(user.organizationId, opportunity.id);
  // Escrow (v1.4 Slice 2). Read-only here — a CLOSING-write user opens it explicitly.
  const escrow = await getEscrowRecord(user.organizationId, opportunity.id);
  // Financing (v1.4 Slice 3). Read-only here — a CLOSING-write user starts it explicitly.
  // The active-scenario read is the FC-0 seam: reference-only, never persisted into financing.
  const [financing, activeScenario] = await Promise.all([
    getFinancingRecord(user.organizationId, opportunity.id),
    getActiveScenarioResult(user.organizationId, opportunity.id),
  ]);
  // Assignment (v1.4 Slice 4). Read-only here — a CLOSING-write user starts it explicitly.
  // Its generated agreement drafts are Documents-owned (append-only, AS-M).
  const [assignment, assignmentDrafts] = await Promise.all([
    getAssignmentRecord(user.organizationId, opportunity.id),
    listGeneratedAgreements(user.organizationId, opportunity.id),
  ]);
  const canWriteClosing = can(user.role, "UPDATE", "CLOSING");
  const canWaiveClosing = canWaiveClosingItem(user.role);
  const canResolveEscrowNow = canResolveEscrow(user.role);
  const canResolveFinancingNow = canResolveFinancing(user.role);
  const canExecuteAssignmentNow = canExecuteAssignment(user.role);
  // Members are only needed for the checklist; documents are shared by the closing evidence
  // picker, the escrow proof-of-deposit picker, and the financing document links.
  const [closingMembers, opportunityDocuments] =
    closing || escrow || financing
      ? await Promise.all([
          closing
            ? prisma.user.findMany({
                where: { organizationId: user.organizationId, lifecycleState: "ACTIVE" },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
              })
            : Promise.resolve([] as { id: string; name: string }[]),
          prisma.document.findMany({
            where: { organizationId: user.organizationId, opportunityId: opportunity.id },
            select: { id: true, title: true },
            orderBy: { createdAt: "desc" },
          }),
        ])
      : [[], []];

  // Group items by category (DD-only in slice 1) and map to the client view shape.
  const closingItemsByCategory = new Map<string, ChecklistItemView[]>();
  for (const it of closing?.items ?? []) {
    const view: ChecklistItemView = {
      id: it.id,
      label: it.label,
      description: it.description,
      required: it.required,
      status: it.status,
      ownerId: it.ownerId,
      dueDate: it.dueDate ? it.dueDate.toISOString().slice(0, 10) : null,
      waiverReason: it.waiverReason,
      evidenceDocumentId: it.evidenceDocumentId,
      completionEvidenceType: it.completionEvidenceType,
    };
    const bucket = closingItemsByCategory.get(it.category) ?? [];
    bucket.push(view);
    closingItemsByCategory.set(it.category, bucket);
  }
  const closingStats = closing ? closingProgress(closing.items) : null;

  // Escrow view + the optional EC-J checklist-sync target (an ESCROW-category item, if any).
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const escrowView: EscrowView | null = escrow
    ? {
        status: escrow.status,
        earnestAmountUsd: escrow.earnestAmountUsd,
        escrowHolderName: escrow.escrowHolderName,
        escrowHolderContact: escrow.escrowHolderContact,
        earnestDueDate: iso(escrow.earnestDueDate),
        depositedDate: iso(escrow.depositedDate),
        contingencyDeadline: iso(escrow.contingencyDeadline),
        proofOfDepositDocumentId: escrow.proofOfDepositDocumentId,
        resolutionReason: escrow.resolutionReason,
        events: escrow.events.map((ev) => ({
          type: ev.type,
          amountUsdSnapshot: ev.amountUsdSnapshot,
          holderNameSnapshot: ev.holderNameSnapshot,
          proofDocumentIdSnapshot: ev.proofDocumentIdSnapshot,
          reason: ev.reason,
          occurredAt: ev.occurredAt.toISOString(),
        })),
      }
    : null;
  const escrowChecklistItem = (() => {
    const it = closing?.items.find((i) => i.category === "ESCROW");
    return it ? { id: it.id, label: it.label, status: it.status } : null;
  })();
  // Financing view (v1.4 Slice 3). All dates surfaced as yyyy-mm-dd; no money fields (FC-5).
  const financingView: FinancingView | null = financing
    ? {
        status: financing.status,
        lenderName: financing.lenderName,
        lenderContact: financing.lenderContact,
        applicationSubmittedDate: iso(financing.applicationSubmittedDate),
        appraisalOrderedDate: iso(financing.appraisalOrderedDate),
        appraisalCompletedDate: iso(financing.appraisalCompletedDate),
        commitmentReceivedDate: iso(financing.commitmentReceivedDate),
        conditionsReceivedDate: iso(financing.conditionsReceivedDate),
        conditionsSatisfiedDate: iso(financing.conditionsSatisfiedDate),
        closingPackageReceivedDate: iso(financing.closingPackageReceivedDate),
        fundedDate: iso(financing.fundedDate),
        commitmentLetterDocumentId: financing.commitmentLetterDocumentId,
        appraisalDocumentId: financing.appraisalDocumentId,
        resolvedAt: financing.resolvedAt ? financing.resolvedAt.toISOString() : null,
        resolutionReason: financing.resolutionReason,
        resolutionLenderNameSnapshot: financing.resolutionLenderNameSnapshot,
      }
    : null;
  // Assignment view (v1.4 Slice 4). Parties + immutable execution snapshot; the fee/contract
  // value shown come from the Opportunity (read-only here, AS-3).
  const assignmentView: AssignmentView | null = assignment
    ? {
        status: assignment.status,
        assignorName: assignment.assignorName,
        assignorContact: assignment.assignorContact,
        assigneeName: assignment.assigneeName,
        assigneeContact: assignment.assigneeContact,
        resolvedAt: assignment.resolvedAt ? assignment.resolvedAt.toISOString() : null,
        resolutionReason: assignment.resolutionReason,
        executedFeeUsdSnapshot: assignment.executedFeeUsdSnapshot,
        executedContractValueUsdSnapshot: assignment.executedContractValueUsdSnapshot,
        executedAssignorNameSnapshot: assignment.executedAssignorNameSnapshot,
        executedAssigneeNameSnapshot: assignment.executedAssigneeNameSnapshot,
        executedAgreementDocumentIdSnapshot: assignment.executedAgreementDocumentIdSnapshot,
      }
    : null;
  const assignmentDraftViews: AssignmentDraft[] = assignmentDrafts.map((d) => ({
    id: d.id,
    generationSequence: d.generationSequence ?? 0,
    generatedAt: d.generatedAt ? d.generatedAt.toISOString() : null,
  }));

  // FC-0: read-only reference to the active scenario's primary financing case debt. Displayed
  // for context only; never copied, cached, or persisted into the FinancingRecord.
  const primaryCaseResult = activeScenario?.financingCases[0]?.result ?? null;
  const underwritingRef: FinancingUnderwritingRef = primaryCaseResult
    ? {
        sizedLoanUsd: primaryCaseResult.sizedLoanUsd,
        dscr: primaryCaseResult.dscr,
        debtYieldPct: primaryCaseResult.debtYieldPct,
        bindingConstraint: primaryCaseResult.bindingConstraint,
      }
    : null;

  // The required items still blocking a move to Paid — surfaced so the gate explains
  // itself rather than silently hiding the option (server enforcement is unchanged).
  const closingBlockers = closing && !closingStats?.ready ? blockingItems(closing.items).map((i) => i.label) : [];

  // Closing Center container (v1.4, Option C) — presentation only. The persistent readiness
  // header renders exactly the authoritative summary (a pure composition of the existing
  // closingProgress / blockingItems / closingBlockMessage helpers — no second calculation),
  // and each accordion section shows its domain's current status in the header without being
  // opened. The Checklist section defaults open because it governs PAID readiness.
  const readiness = closing ? closingReadinessSummary(closing.items) : null;
  const checklistStatus = readiness
    ? `${readiness.requiredSatisfied} of ${readiness.requiredTotal} required complete`
    : "Not started";
  const checklistStatusTone = readiness ? (readiness.ready ? "success" : "warning") : "neutral";
  const escrowStatusText = escrowView ? escrowStatusLabel(escrowView.status) : "Not opened";
  const escrowStatusToneVal = escrowView ? escrowStatusTone(escrowView.status) : "neutral";
  const financingStatusText = financingView ? financingStatusLabel(financingView.status) : "Not started";
  const financingStatusToneVal = financingView ? financingStatusTone(financingView.status) : "neutral";
  const assignmentStatusText = assignmentView ? assignmentStatusLabel(assignmentView.status) : "Not started";
  const assignmentStatusToneVal = assignmentView ? assignmentStatusTone(assignmentView.status) : "neutral";
  // AS-N: a small at-a-glance assignment summary on the opportunity header — shown only once the
  // assignment is past NOT_STARTED (Drafted / Executed / Cancelled).
  const showAssignmentHeaderBadge = assignmentView != null && assignmentView.status !== "NOT_STARTED";

  const terms: { label: string; value: string | null }[] = [
    { label: "Source", value: opportunity.source },
    { label: "Priority", value: opportunity.priority },
    { label: "Target close", value: opportunity.targetCloseDate ? opportunity.targetCloseDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null },
    { label: "Contract value", value: usd(opportunity.contractValueUsd) },
    { label: "Assignment fee", value: usd(opportunity.assignmentFeeUsd) },
  ];

  const deleteOpportunityBound = deleteOpportunity.bind(null, opportunity.id);

  // The PAID move is additionally gated by the closing checklist (CC-2). The server
  // enforces this regardless; here we hide the option until every required item is
  // satisfied so the control matches what will actually be accepted. No checklist yet
  // ⇒ not offered (attempting it server-side would instantiate one and block).
  const closingReady = closingStats?.ready ?? false;

  // Only the stages this role may move to from the current stage (plus the
  // current stage itself, which stays selected). Server re-checks on submit.
  const moveableStages = STAGE_OPTIONS.filter(
    (s) =>
      s.value === opportunity.stage ||
      (canMoveStage(user.role, opportunity.stage, s.value) && (s.value !== "PAID" || closingReady)),
  );
  const canRemoveMatch = can(user.role, "DELETE", "BUYER_MATCH");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opportunity"
        title={opportunity.title}
        description={`${opportunity.property.name} · ${titleCase(opportunity.property.assetType)}`}
        actions={
          <>
            {can(user.role, "UPDATE", "OPPORTUNITY") ? (
              <Link className="btn-ghost" href={`/opportunities/${opportunity.id}/edit`}>
                <Icon name="notes" className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            {can(user.role, "DELETE", "OPPORTUNITY") ? (
              <form action={deleteOpportunityBound}>
                <button type="submit" className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
                  Delete
                </button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <article className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="eyebrow">Stage</p>
                <Badge tone="info" dot>{stageLabel(opportunity.stage)}</Badge>
                {showAssignmentHeaderBadge ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">Assignment</span>
                    <Badge tone={assignmentStatusToneVal}>{assignmentStatusText}</Badge>
                  </span>
                ) : null}
              </div>
              {moveableStages.length > 1 ? (
                <StageSelect action={moveOpportunityStage.bind(null, opportunity.id)} current={opportunity.stage} stages={moveableStages} />
              ) : null}
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {terms.map((t) => (
                <div key={t.label}>
                  <dt className="text-xs text-slate-500">{t.label}</dt>
                  <dd className="metric mt-0.5 text-sm font-medium text-slate-900">
                    {t.label === "Priority" && t.value ? <Badge tone={statusTone(t.value)}>{t.value}</Badge> : (t.value ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>
            {opportunity.summary ? (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="eyebrow">Summary</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{opportunity.summary}</p>
              </div>
            ) : null}
          </article>

          {/* Closing Center — one grouped operational workspace (v1.4, Option C). A pure
              presentation container: a persistent readiness header + accordion sections over
              the SAME self-contained domain cards, each receiving the SAME props as before. */}
          <section id="closing-center" className="card scroll-mt-6" aria-labelledby="closing-center-heading">
            {/* Persistent readiness header — renders exactly the authoritative summary. */}
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="closing-center-heading" className="text-base font-semibold text-slate-900">Closing Center</h2>
                  <p className="text-xs text-slate-500">Due diligence, escrow, financing, and assignment for this opportunity.</p>
                </div>
                {readiness ? (
                  <Badge tone={readiness.ready ? "success" : "warning"} dot>
                    {readiness.ready ? "Ready to close" : `${readiness.requiredSatisfied}/${readiness.requiredTotal} required`}
                  </Badge>
                ) : (
                  <Badge tone="neutral" dot>Checklist not started</Badge>
                )}
              </div>
              {readiness && !readiness.ready ? (
                <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">
                    Not ready for Paid — {readiness.outstandingCount} required {readiness.outstandingCount === 1 ? "item" : "items"} outstanding
                  </p>
                  {closingBlockers.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {closingBlockers.map((label) => (
                        <li key={label} className="flex items-center gap-2 text-xs text-amber-900">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                          <span className="break-words">{label}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : readiness ? (
                <p className="mt-2 text-xs font-medium text-emerald-700">All required items satisfied — this opportunity can move to Paid.</p>
              ) : null}
            </div>

            {/* Accordion sections — each header shows its status without being opened. */}
            <div className="divide-y divide-slate-100">
              <AccordionSection title="Closing Checklist" status={checklistStatus} statusTone={checklistStatusTone} defaultOpen>
                {closing ? (
                  <div className="divide-y divide-slate-100 pb-2">
                    {Array.from(closingItemsByCategory.entries()).map(([category, items]) => (
                      <div key={category}>
                        <p className="eyebrow px-5 pt-4">{checklistCategoryLabel(category)}</p>
                        <ClosingChecklist
                          opportunityId={opportunity.id}
                          items={items}
                          members={closingMembers}
                          documents={opportunityDocuments}
                          canWrite={canWriteClosing}
                          canWaive={canWaiveClosing}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-6">
                    {canWriteClosing ? (
                      <div className="flex flex-col items-start gap-2">
                        <p className="text-sm text-slate-500">
                          No closing checklist yet. Start one from your organization&rsquo;s standard template.
                        </p>
                        <StartClosingChecklistButton opportunityId={opportunity.id} />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No closing checklist has been started for this opportunity.</p>
                    )}
                  </div>
                )}
              </AccordionSection>

              <AccordionSection title="Escrow" status={escrowStatusText} statusTone={escrowStatusToneVal}>
                <EscrowCard
                  opportunityId={opportunity.id}
                  escrow={escrowView}
                  documents={opportunityDocuments}
                  canWrite={canWriteClosing}
                  canResolve={canResolveEscrowNow}
                  escrowChecklistItem={escrowChecklistItem}
                />
              </AccordionSection>

              <AccordionSection title="Financing" status={financingStatusText} statusTone={financingStatusToneVal}>
                <FinancingCard
                  opportunityId={opportunity.id}
                  financing={financingView}
                  documents={opportunityDocuments}
                  underwritingRef={underwritingRef}
                  canWrite={canWriteClosing}
                  canResolve={canResolveFinancingNow}
                />
              </AccordionSection>

              <AccordionSection title="Assignment" status={assignmentStatusText} statusTone={assignmentStatusToneVal}>
                <AssignmentCard
                  opportunityId={opportunity.id}
                  assignment={assignmentView}
                  drafts={assignmentDraftViews}
                  feeUsd={opportunity.assignmentFeeUsd}
                  contractValueUsd={opportunity.contractValueUsd}
                  canWrite={canWriteClosing}
                  canExecute={canExecuteAssignmentNow}
                />
              </AccordionSection>
            </div>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <article className="card p-6">
            <p className="eyebrow">Links</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-slate-500">Property</p>
                <Link href={`/properties/${opportunity.property.id}`} className="mt-0.5 block text-sm font-medium text-brand-700 hover:underline">
                  {opportunity.property.name}
                </Link>
                <p className="text-xs text-slate-400">{[opportunity.property.city, opportunity.property.state].filter(Boolean).join(", ")}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Seller</p>
                {opportunity.seller ? (
                  <Link href={`/sellers/${opportunity.seller.id}`} className="mt-0.5 block text-sm font-medium text-brand-700 hover:underline">
                    {opportunity.seller.name}
                  </Link>
                ) : (
                  <p className="mt-0.5 text-sm font-medium text-slate-900">Unassigned</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Organization</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{user.organizationName}</p>
              </div>
            </div>
          </article>

          <TransactionTimelinePanel timeline={timeline} basePath={`/opportunities/${opportunity.id}`} />
        </div>
      </div>

      <article className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Buyer Matches</h2>
            <p className="text-xs text-slate-500">
              Deterministic fit across asset type, location, and price. {matches.length > 0 ? `${matches.length} match${matches.length === 1 ? "" : "es"}.` : null}
            </p>
          </div>
          <GenerateMatchesButton opportunityId={opportunity.id} />
        </div>
        {matches.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {matches.map((m) => (
              <li key={m.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/buyers/${m.buyer.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        {m.buyer.name}
                      </Link>
                      {m.buyer.company ? <span className="text-xs text-slate-400">{m.buyer.company}</span> : null}
                      <Badge tone={matchStatusTone(m.status)}>{matchStatusLabel(m.status)}</Badge>
                    </div>
                    {m.thesis ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{m.thesis}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-baseline gap-1">
                      <span className="metric text-lg font-semibold text-slate-900">{m.score ?? "—"}</span>
                      <span className="text-xs text-slate-400">/100</span>
                    </div>
                    <MatchRowControls matchId={m.id} current={m.status} canRemove={canRemoveMatch} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="buyers"
            title="No buyer matches yet"
            description="Run “Find matching buyers” to score buyers in your organization against this opportunity."
          />
        )}
      </article>

      <NotesSection organizationId={user.organizationId} type="opportunity" id={opportunity.id} />
    </div>
  );
}
