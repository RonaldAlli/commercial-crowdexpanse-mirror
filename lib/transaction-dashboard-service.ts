// Closing Center Slice 5 — Transaction Dashboard: the read path (DB orchestration). Runs ONE
// org-scoped query for in-flight opportunities + their 1:1 Closing records + checklist items,
// resolves responsible-item owners in a single lookup (no N+1), and maps each to the pure
// projection. It performs NO writes (TX-3) and NO underwriting read (TD-K). The reference instant
// is INJECTED by the caller so the projection stays clock-free (TD-D). Thin by design: all logic
// lives in the pure lib/transaction-dashboard module; this only reads and maps.
import type { OpportunityStage } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  dashboardStages,
  isInFlightStage,
  projectTransactionRow,
  sortTransactionRows,
  type TransactionProjectionInput,
  type TransactionRow,
} from "@/lib/transaction-dashboard";

const ms = (d: Date | null) => (d ? d.getTime() : null);

export type DashboardQuery = { stage?: OpportunityStage; includeClosed?: boolean; referenceMs: number };

/**
 * Read + project the in-flight transaction rows for an organization (read-only). `stage` narrows
 * to a single in-flight stage; otherwise the whole in-flight set (+ PAID when `includeClosed`).
 * Org-scoped throughout — a row can never expose another organization's data.
 */
export async function getTransactionDashboardRows(organizationId: string, opts: DashboardQuery): Promise<TransactionRow[]> {
  const stageIn: OpportunityStage[] =
    opts.stage && isInFlightStage(opts.stage) ? [opts.stage] : dashboardStages(!!opts.includeClosed);

  const opportunities = await prisma.opportunity.findMany({
    where: { organizationId, stage: { in: stageIn } },
    select: {
      id: true,
      title: true,
      stage: true,
      targetCloseDate: true,
      property: { select: { name: true } },
      closingChecklist: {
        select: { items: { select: { required: true, status: true, label: true, dueDate: true, ownerId: true } } },
      },
      escrow: { select: { status: true, earnestDueDate: true, contingencyDeadline: true } },
      financing: { select: { status: true } },
      assignment: { select: { status: true } },
    },
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });

  // Resolve responsible-item owner ids → names in ONE org-scoped query (no per-row N+1).
  const ownerIds = Array.from(
    new Set(opportunities.flatMap((o) => o.closingChecklist?.items.map((i) => i.ownerId).filter((x): x is string => !!x) ?? [])),
  );
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds }, organizationId }, select: { id: true, name: true } })
    : [];
  const ownerName = new Map(owners.map((u) => [u.id, u.name]));

  const rows = opportunities.map((o) => {
    const input: TransactionProjectionInput = {
      opportunity: { id: o.id, title: o.title, stage: o.stage, propertyName: o.property.name, targetCloseDateMs: ms(o.targetCloseDate) },
      checklistItems: o.closingChecklist
        ? o.closingChecklist.items.map((i) => ({
            required: i.required,
            status: i.status,
            label: i.label,
            dueDateMs: ms(i.dueDate),
            ownerName: i.ownerId ? ownerName.get(i.ownerId) ?? null : null,
          }))
        : null,
      escrow: o.escrow
        ? { status: o.escrow.status, earnestDueDateMs: ms(o.escrow.earnestDueDate), contingencyDeadlineMs: ms(o.escrow.contingencyDeadline) }
        : null,
      financing: o.financing ? { status: o.financing.status } : null,
      assignment: o.assignment ? { status: o.assignment.status } : null,
    };
    return projectTransactionRow(input, opts.referenceMs);
  });

  // Deterministic, DB-order-independent ordering (TD-10) — never rely on query return order.
  return sortTransactionRows(rows);
}
