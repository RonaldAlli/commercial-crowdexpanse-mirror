import { prisma } from "@/lib/prisma";
import { normalizeKey, rate, orderByValueThenKey } from "./shape";
import type {
  RevenueByChannelRow,
  ClosedWonConversionRow,
  BuyerCoverageRow,
  AssignmentRevenueByCampaignRow,
  RevenueByAcquisitionEventRow,
} from "./types";

// Business Query Primitives — Phase 1. Deterministic, organization-scoped (Authority Rule 1), all-time
// (date-window filtering is a later ADDITIVE input, never hidden here). Every metric derives from
// authoritative facts (BI Rule 1): REALIZED REVENUE = SUM(AssignmentRecord.executedFeeUsdSnapshot)
// WHERE status = EXECUTED — never the mutable Opportunity.assignmentFeeUsd.

type ExecutedAssignment = { fee: number; channel: string | null; campaign: string | null; eventKey: string | null };

/** The one authoritative realized-revenue population: executed assignments + their opportunity's attribution. */
async function fetchExecutedAssignments(organizationId: string): Promise<ExecutedAssignment[]> {
  const rows = await prisma.assignmentRecord.findMany({
    where: { organizationId, status: "EXECUTED" },
    select: {
      executedFeeUsdSnapshot: true,
      opportunity: { select: { acquisitionChannel: true, acquisitionCampaign: true, acquisitionEventKey: true } },
    },
  });
  return rows.map((r) => ({
    fee: r.executedFeeUsdSnapshot ?? 0, // executed but unsnapshotted fee contributes 0, still a closed deal
    channel: r.opportunity.acquisitionChannel,
    campaign: r.opportunity.acquisitionCampaign,
    eventKey: r.opportunity.acquisitionEventKey,
  }));
}

/** Sum executed revenue + deal count grouped by a normalized attribution dimension. */
function reduceRevenue(items: ExecutedAssignment[], dimension: (a: ExecutedAssignment) => string | null) {
  const acc = new Map<string, { executedRevenueUsd: number; dealCount: number }>();
  for (const item of items) {
    const key = normalizeKey(dimension(item));
    const cur = acc.get(key) ?? { executedRevenueUsd: 0, dealCount: 0 };
    cur.executedRevenueUsd += item.fee;
    cur.dealCount += 1;
    acc.set(key, cur);
  }
  return acc;
}

export async function revenueByChannel(organizationId: string): Promise<RevenueByChannelRow[]> {
  const acc = reduceRevenue(await fetchExecutedAssignments(organizationId), (a) => a.channel);
  const rows = Array.from(acc).map(([channel, v]) => ({ channel, ...v }));
  return orderByValueThenKey(rows, (r) => r.executedRevenueUsd, (r) => r.channel);
}

export async function assignmentRevenueByCampaign(organizationId: string): Promise<AssignmentRevenueByCampaignRow[]> {
  const acc = reduceRevenue(await fetchExecutedAssignments(organizationId), (a) => a.campaign);
  const rows = Array.from(acc).map(([campaign, v]) => ({ campaign, ...v }));
  return orderByValueThenKey(rows, (r) => r.executedRevenueUsd, (r) => r.campaign);
}

export async function revenueByAcquisitionEvent(organizationId: string): Promise<RevenueByAcquisitionEventRow[]> {
  const acc = reduceRevenue(await fetchExecutedAssignments(organizationId), (a) => a.eventKey);
  const rows = Array.from(acc).map(([eventKey, v]) => ({ eventKey, ...v }));
  return orderByValueThenKey(rows, (r) => r.executedRevenueUsd, (r) => r.eventKey);
}

/**
 * Closed-won conversion rate by channel = DISTINCT opportunities with an EXECUTED assignment ÷ all
 * opportunities in the channel. AssignmentRecord is 1:1 with Opportunity, so counts are inherently distinct.
 */
export async function closedWonConversionByChannel(organizationId: string): Promise<ClosedWonConversionRow[]> {
  const opps = await prisma.opportunity.findMany({
    where: { organizationId },
    select: { acquisitionChannel: true, assignment: { select: { status: true } } },
  });
  const acc = new Map<string, { opportunityCount: number; convertedOpportunityCount: number }>();
  for (const o of opps) {
    const key = normalizeKey(o.acquisitionChannel);
    const cur = acc.get(key) ?? { opportunityCount: 0, convertedOpportunityCount: 0 };
    cur.opportunityCount += 1;
    if (o.assignment?.status === "EXECUTED") cur.convertedOpportunityCount += 1;
    acc.set(key, cur);
  }
  const rows = Array.from(acc).map(([channel, v]) => ({
    channel,
    ...v,
    conversionRate: rate(v.convertedOpportunityCount, v.opportunityCount),
  }));
  return orderByValueThenKey(rows, (r) => r.conversionRate, (r) => r.channel);
}

/**
 * Buyer-coverage rate by channel = opportunities with ≥1 persisted BuyerMatch ÷ all opportunities.
 * (A stricter confirmedMatchRateByChannel() is a SEPARATE future primitive — this one is never redefined.)
 */
export async function buyerCoverageByChannel(organizationId: string): Promise<BuyerCoverageRow[]> {
  const opps = await prisma.opportunity.findMany({
    where: { organizationId },
    select: { acquisitionChannel: true, _count: { select: { buyerMatches: true } } },
  });
  const acc = new Map<string, { opportunityCount: number; opportunitiesWithMatch: number }>();
  for (const o of opps) {
    const key = normalizeKey(o.acquisitionChannel);
    const cur = acc.get(key) ?? { opportunityCount: 0, opportunitiesWithMatch: 0 };
    cur.opportunityCount += 1;
    if (o._count.buyerMatches > 0) cur.opportunitiesWithMatch += 1;
    acc.set(key, cur);
  }
  const rows = Array.from(acc).map(([channel, v]) => ({
    channel,
    ...v,
    coverageRate: rate(v.opportunitiesWithMatch, v.opportunityCount),
  }));
  return orderByValueThenKey(rows, (r) => r.coverageRate, (r) => r.channel);
}
