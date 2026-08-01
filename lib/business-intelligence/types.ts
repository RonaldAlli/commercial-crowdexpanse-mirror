// Business Query Primitives — Phase 1 return contracts. Presentation-independent: every dashboard,
// report, export, email, or AI advisor is a CONSUMER of these; the business truth exists once.
// See docs/architecture/BUSINESS_INTELLIGENCE_PRINCIPLES.md.

// Null attribution is normalized to this explicit label — never silently dropped, so totals reconcile
// and unattributed volume stays visible (a measure of attribution quality).
export const UNKNOWN = "UNKNOWN";

export type RevenueByChannelRow = {
  channel: string; // AcquisitionChannel value, or "UNKNOWN"
  executedRevenueUsd: number;
  dealCount: number;
};

export type ClosedWonConversionRow = {
  channel: string;
  opportunityCount: number;
  convertedOpportunityCount: number;
  conversionRate: number | null; // null when opportunityCount === 0 ("not measurable", not zero)
};

export type BuyerCoverageRow = {
  channel: string;
  opportunityCount: number;
  opportunitiesWithMatch: number;
  coverageRate: number | null; // null when opportunityCount === 0
};

export type AssignmentRevenueByCampaignRow = {
  campaign: string; // campaign label, or "UNKNOWN"
  executedRevenueUsd: number;
  dealCount: number;
};

export type RevenueByAcquisitionEventRow = {
  eventKey: string; // acquisition-event id, or "UNKNOWN"
  executedRevenueUsd: number;
  dealCount: number;
};

// One realized revenue event = one EXECUTED assignment. Lists the SAME authoritative population as the grouped
// realized-revenue queries (BI Rule 1), per deal, with the execution date and acquisition attribution. No metric
// is computed — realizedUsd is the executed-fee snapshot; executedAt is the assignment's terminal resolution.
export type RealizedRevenueEventRow = {
  opportunityId: string;
  opportunityTitle: string;
  realizedUsd: number; // AssignmentRecord.executedFeeUsdSnapshot (0 if executed but unsnapshotted)
  executedAt: Date | null; // AssignmentRecord.resolvedAt — the execution date
  channel: string; // AcquisitionChannel value, or "UNKNOWN"
  campaign: string | null; // campaign label, or null
};
