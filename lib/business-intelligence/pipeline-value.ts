import type { OpportunityStage } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeKey } from "./shape";

// Pipeline Value — OPERATIONAL INVENTORY (never a forecast). Owner = Revenue (Financial State Authority).
//
// Pipeline Value = the unweighted SUM of Expected fee (`Opportunity.assignmentFeeUsd`) across the OPEN PIPELINE
// population (no probability, no weighting). Population = opportunities with an executed acquisition contract,
// not yet realized, and still ACTIVE:
//   stage ∈ { UNDER_CONTRACT, BUYER_MATCHED, CLOSING }  AND  outcome = ACTIVE  AND  NOT (assignment executed).
// Since Forecasting Backend Authority G-1, Lost/Dead deals (explicit outcomes) ARE excluded — no inference.
//
// Inventory Integrity: every breakdown reconciles to the total (each opportunity has exactly one stage, one
// channel key, one campaign key), and each contributing dollar is a real `assignmentFeeUsd` on a real deal.

export const OPEN_PIPELINE_STAGES = ["UNDER_CONTRACT", "BUYER_MATCHED", "CLOSING"] as const;

export type PipelineValueRow = { opportunityId: string; title: string; assignmentFeeUsd: number | null; stage: string; channel: string | null; campaign: string | null };
export type PipelineValueBreakdownRow = { key: string; valueUsd: number; dealCount: number };
// One contributing deal in the inventory (Inventory Integrity + Population Transparency: the list IS the
// population, so Σ deal fees === totalUsd, and every dollar traces to a displayed Opportunity).
export type PipelineValueDealRow = { opportunityId: string; title: string; stage: string; channel: string | null; campaign: string | null; feeUsd: number };
export type PipelineValueSummary = {
  totalUsd: number;
  dealCount: number; // all opportunities in the population
  feeSetCount: number; // deals with an assignmentFeeUsd set (Information Quality)
  byStage: PipelineValueBreakdownRow[];
  byChannel: PipelineValueBreakdownRow[];
  byCampaign: PipelineValueBreakdownRow[];
  deals: PipelineValueDealRow[]; // the contributing population, highest fee first
};

function groupSum(rows: PipelineValueRow[], dim: (r: PipelineValueRow) => string): PipelineValueBreakdownRow[] {
  const acc = new Map<string, { valueUsd: number; dealCount: number }>();
  for (const r of rows) {
    const key = dim(r);
    const cur = acc.get(key) ?? { valueUsd: 0, dealCount: 0 };
    cur.valueUsd += r.assignmentFeeUsd ?? 0;
    cur.dealCount += 1;
    acc.set(key, cur);
  }
  return Array.from(acc, ([key, v]) => ({ key, ...v })).sort((a, b) => b.valueUsd - a.valueUsd || a.key.localeCompare(b.key));
}

/** Pure aggregation of the open-pipeline population into the Pipeline Value summary (Inventory Integrity). */
export function aggregatePipelineValue(rows: PipelineValueRow[]): PipelineValueSummary {
  const totalUsd = rows.reduce((n, r) => n + (r.assignmentFeeUsd ?? 0), 0);
  return {
    totalUsd,
    dealCount: rows.length,
    feeSetCount: rows.filter((r) => r.assignmentFeeUsd != null).length,
    byStage: groupSum(rows, (r) => r.stage),
    byChannel: groupSum(rows, (r) => normalizeKey(r.channel)),
    byCampaign: groupSum(rows, (r) => normalizeKey(r.campaign)),
    deals: rows
      .map((r) => ({ opportunityId: r.opportunityId, title: r.title, stage: r.stage, channel: r.channel, campaign: r.campaign, feeUsd: r.assignmentFeeUsd ?? 0 }))
      .sort((a, b) => b.feeUsd - a.feeUsd || a.title.localeCompare(b.title)),
  };
}

/** Read the open-pipeline population from active authority and aggregate it (org-scoped; no new storage). */
export async function pipelineValueSummary(organizationId: string): Promise<PipelineValueSummary> {
  const rows = await prisma.opportunity.findMany({
    where: {
      organizationId,
      stage: { in: OPEN_PIPELINE_STAGES as unknown as OpportunityStage[] },
      outcome: "ACTIVE", // G-1: exclude Lost/Dead — the open pipeline is ACTIVE deals only
      NOT: { assignment: { status: "EXECUTED" } }, // exclude realized (executed assignment); no-assignment deals stay in
    },
    select: { id: true, title: true, assignmentFeeUsd: true, stage: true, acquisitionChannel: true, acquisitionCampaign: true },
  });
  return aggregatePipelineValue(rows.map((r) => ({ opportunityId: r.id, title: r.title, assignmentFeeUsd: r.assignmentFeeUsd, stage: r.stage, channel: r.acquisitionChannel, campaign: r.acquisitionCampaign })));
}
