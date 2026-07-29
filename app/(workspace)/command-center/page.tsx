// CRE Operating Workspace — UI M1 Increment 4: Command Center route.
//
// Server component. Tenant-scoped via requireUser().organizationId; role-gated section visibility via
// the existing `can(...)` matrix (no new permission semantics). A THIN READ FACADE: it orchestrates
// existing service outputs, writes nothing, and creates no new business truth. The Opportunity Workspace
// is the authoritative deep-link target for opportunity detail.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getAcquisitionQueue, getDailyAcquisitionMetrics } from "@/lib/acquisition-queue";
import { getTransactionDashboardRows } from "@/lib/transaction-dashboard-service";
import { revenueByChannel } from "@/lib/business-intelligence";
import { CommandCenter } from "@/components/workspace-ui/command-center/CommandCenter";
import {
  acquisitionMetricViews, revenueAllTimeView, sellerSection, transactionSection,
  orderRecentOpportunities, dedupeRecent, recentOppView, type MetricView,
} from "@/lib/workspace-ui/command-center";

export const dynamic = "force-dynamic";

const SELLER_LIMIT = 8;
const ATTENTION_LIMIT = 8;
const RECENT_LIMIT = 8;

export default async function CommandCenterPage() {
  const user = await requireUser();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const canSellers = can(user.role, "READ", "SELLER");
  const canOpps = can(user.role, "READ", "OPPORTUNITY");

  const [queue, metrics, txRows, revRows, recentRaw] = await Promise.all([
    canSellers ? getAcquisitionQueue(user.organizationId, now) : Promise.resolve([]),
    canSellers ? getDailyAcquisitionMetrics(user.organizationId, startOfDay) : Promise.resolve(null),
    canOpps ? getTransactionDashboardRows(user.organizationId, { referenceMs: now.getTime() }) : Promise.resolve([]),
    canOpps ? revenueByChannel(user.organizationId) : Promise.resolve([]),
    canOpps
      ? prisma.opportunity.findMany({
          where: { organizationId: user.organizationId },
          select: { id: true, title: true, stage: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 24,
        })
      : Promise.resolve([]),
  ]);

  const metricViews: MetricView[] = [
    ...(canSellers && metrics ? acquisitionMetricViews(metrics) : []),
    ...(canOpps ? [revenueAllTimeView(revRows)] : []),
  ];

  const attention = transactionSection(
    txRows.map((r) => ({
      opportunityId: r.opportunityId,
      title: r.title,
      propertyName: r.propertyName,
      stage: r.stage,
      readiness: r.readiness ? { ready: r.readiness.ready, outstandingCount: r.readiness.outstandingCount, blockerLabels: r.readiness.blockerLabels } : null,
      nextMilestone: r.nextMilestone,
    })),
    ATTENTION_LIMIT,
  );

  const recentOrdered = orderRecentOpportunities(recentRaw.map((o) => ({ id: o.id, title: o.title, stage: o.stage, updatedAtMs: o.updatedAt.getTime() })));
  const recent = dedupeRecent(recentOrdered, new Set(attention.map((a) => a.opportunityId)))
    .slice(0, RECENT_LIMIT)
    .map(recentOppView);

  return (
    <CommandCenter
      metrics={metricViews}
      sellers={{ visible: canSellers, rows: sellerSection(queue, now, SELLER_LIMIT) }}
      attention={{ visible: canOpps, rows: attention }}
      recent={{ visible: canOpps, rows: recent }}
    />
  );
}
