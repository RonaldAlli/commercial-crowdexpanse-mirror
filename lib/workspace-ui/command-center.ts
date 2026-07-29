// CRE Operating Workspace — UI M1 Increment 4 (Command Center orchestration).
//
// PURE, read-only orchestration/view-models over EXISTING service outputs. No data access, no
// clock/random, no mutation. It normalizes, deterministically orders, dedupes, and limits already-
// fetched facts for presentation. It creates NO new business truth: it invents no motivation/priority
// score, chooses no Next Best Action, and synthesizes no Missing Information. Every metric carries an
// Observed/Computed classification and a time basis; unavailable capabilities are declared honestly.

import { stageLabel } from "@/lib/opportunity-options";
import { mapQueue, type QueueRowView } from "@/lib/workspace-ui/seller-view";
import type { QueueSeller } from "@/lib/acquisition-queue";
import type { DailyMetrics } from "@/lib/acquisition-queue";
import type { RevenueByChannelRow } from "@/lib/business-intelligence/types";

// Deterministic ordering rule for the "recent opportunities" section — documented + tested. It uses
// ONLY existing fields and is explicitly NOT a score/ranking/priority.
export const RECENT_OPPORTUNITY_ORDER = "updatedAt desc, then id asc (deterministic tie-break)";
export const RECENT_OPPORTUNITY_SECTION_LABEL = "Recent opportunities"; // neutral — never "Top opportunities"

export type RecentOpp = { id: string; title: string; stage: string; updatedAtMs: number };
export type RecentOppView = { id: string; title: string; stageLabel: string; href: string };

/** Deterministic sort over already-fetched rows (pure). Never a proprietary ranking. */
export function orderRecentOpportunities(rows: RecentOpp[]): RecentOpp[] {
  return [...rows].sort((a, b) => b.updatedAtMs - a.updatedAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function recentOppView(row: RecentOpp): RecentOppView {
  return { id: row.id, title: row.title, stageLabel: stageLabel(row.stage), href: `/opportunity-workspace/${encodeURIComponent(row.id)}` };
}

/** Suppress recent opportunities already shown in the transaction/blocked section (dedupe). */
export function dedupeRecent(recent: RecentOpp[], shownOpportunityIds: Iterable<string>): RecentOpp[] {
  const shown = new Set(shownOpportunityIds);
  return recent.filter((r) => !shown.has(r.id));
}

// ---- Seller section: reuse the accepted Increment-2 order-preserving mapper (date-driven) ----
export function sellerSection(rows: QueueSeller[], now: Date, limit: number): QueueRowView[] {
  return mapQueue(rows, now).slice(0, limit); // order preserved; only length-limited
}

// ---- Transaction/blocked-opportunity section (order already deterministic: overdue-first) ----
export type TransactionRowInput = {
  opportunityId: string; title: string; propertyName: string; stage: string;
  readiness: { ready: boolean; outstandingCount: number; blockerLabels: string[] } | null;
  nextMilestone: { label: string; dateIso: string; overdue: boolean } | null;
};
export type TransactionRowView = {
  opportunityId: string; title: string; propertyName: string; stageLabel: string;
  milestoneLabel: string | null; overdue: boolean; blockerCount: number; href: string;
};
export function transactionSection(rows: TransactionRowInput[], limit: number): TransactionRowView[] {
  return rows.slice(0, limit).map((r) => ({
    opportunityId: r.opportunityId,
    title: r.title,
    propertyName: r.propertyName,
    stageLabel: stageLabel(r.stage),
    milestoneLabel: r.nextMilestone?.label ?? null,
    overdue: r.nextMilestone?.overdue ?? false,
    blockerCount: r.readiness?.blockerLabels.length ?? 0,
    href: `/opportunity-workspace/${encodeURIComponent(r.opportunityId)}`, // authoritative deep-link target
  }));
}

// ---- Metrics: each carries a taxonomy kind + a time basis ----
export type MetricKind = "observed" | "computed";
export type TimeBasis = "Today" | "Due now" | "All time" | "Current open records";
export type MetricView = { label: string; value: string; kind: MetricKind; basis: TimeBasis };

export function acquisitionMetricViews(m: DailyMetrics): MetricView[] {
  return [
    { label: "Follow-ups due", value: String(m.queueSize), kind: "computed", basis: "Due now" },
    { label: "Calls", value: String(m.callsToday), kind: "observed", basis: "Today" },
    { label: "Touches", value: String(m.touchesToday), kind: "observed", basis: "Today" },
    { label: "Status updates", value: String(m.statusUpdatesToday), kind: "observed", basis: "Today" },
  ];
}

// Revenue is ALL-TIME only (executed assignment fees) — never presented as a period figure.
export function revenueAllTimeView(rows: RevenueByChannelRow[]): MetricView {
  const totalUsd = rows.reduce((n, r) => n + r.executedRevenueUsd, 0);
  return { label: "Revenue", value: `$${totalUsd.toLocaleString("en-US")}`, kind: "computed", basis: "All time" };
}

// ---- Unavailable capabilities (declared honestly; never fabricated) ----
export const UNAVAILABLE_CAPABILITIES = ["Appointments", "Offers", "Period-based revenue"] as const;
