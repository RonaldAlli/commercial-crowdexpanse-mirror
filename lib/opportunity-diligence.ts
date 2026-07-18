import { OpportunityDiligenceStatus, OpportunityStage } from "@prisma/client";

export const PRECONTRACT_DILIGENCE_TEMPLATE = [
  { key: "t12", label: "T-12 / trailing 12-month financials", position: 1 },
  { key: "rent_roll", label: "Rent roll", position: 2 },
  { key: "offering_memo", label: "Offering memorandum / package", position: 3 },
  { key: "trailing_statements", label: "Trailing operating statements", position: 4 },
  { key: "utility_bills", label: "Utility bills", position: 5 },
  { key: "tax_bills", label: "Tax bills", position: 6 },
  { key: "insurance", label: "Insurance summary", position: 7 },
  { key: "estoppels", label: "Tenant estoppels / lease backup", position: 8 },
] as const;

export function diligenceStatusLabel(status: OpportunityDiligenceStatus): string {
  switch (status) {
    case OpportunityDiligenceStatus.NOT_REQUESTED:
      return "Not requested";
    case OpportunityDiligenceStatus.REQUESTED:
      return "Requested";
    case OpportunityDiligenceStatus.RECEIVED:
      return "Received";
    case OpportunityDiligenceStatus.REVIEWED:
      return "Reviewed";
    case OpportunityDiligenceStatus.MISSING:
      return "Missing";
    case OpportunityDiligenceStatus.NOT_APPLICABLE:
      return "Not applicable";
  }
}

export function diligenceStatusTone(status: OpportunityDiligenceStatus): "neutral" | "warning" | "info" | "success" | "danger" {
  switch (status) {
    case OpportunityDiligenceStatus.NOT_REQUESTED:
      return "neutral";
    case OpportunityDiligenceStatus.REQUESTED:
      return "warning";
    case OpportunityDiligenceStatus.RECEIVED:
      return "info";
    case OpportunityDiligenceStatus.REVIEWED:
      return "success";
    case OpportunityDiligenceStatus.MISSING:
      return "danger";
    case OpportunityDiligenceStatus.NOT_APPLICABLE:
      return "neutral";
  }
}

export function isPostContractStage(stage: OpportunityStage): boolean {
  return (
    stage === OpportunityStage.UNDER_CONTRACT ||
    stage === OpportunityStage.BUYER_MATCHED ||
    stage === OpportunityStage.CLOSING ||
    stage === OpportunityStage.PAID
  );
}

export function diligenceFocusForStage(stage: OpportunityStage): string {
  switch (stage) {
    case OpportunityStage.LEAD:
    case OpportunityStage.SELLER_CONTACTED:
    case OpportunityStage.INTERESTED_SELLER:
      return "Work outreach first. Qualify the seller, confirm motivation, and get permission to request financials.";
    case OpportunityStage.FINANCIALS_REQUESTED:
      return "This stage should drive the document ask: request T-12, rent roll, offering package, taxes, utilities, and insurance.";
    case OpportunityStage.T12_RECEIVED:
    case OpportunityStage.RENT_ROLL_RECEIVED:
      return "As documents arrive, move them from requested to received and identify what is still missing before underwriting.";
    case OpportunityStage.UNDERWRITING:
      return "Underwriting should run only once the core financial package is received and the critical holes are visible.";
    case OpportunityStage.OFFER_READY:
    case OpportunityStage.LOI_SENT:
      return "Keep diligence pressure on. Any document still missing at this stage should be flagged before contract.";
    case OpportunityStage.UNDER_CONTRACT:
    case OpportunityStage.BUYER_MATCHED:
    case OpportunityStage.CLOSING:
    case OpportunityStage.PAID:
      return "Pre-contract diligence is done. Contract execution now lives in the Closing Center below.";
  }
}

export function summarizeDiligence(
  items: Array<{ key?: string; status: OpportunityDiligenceStatus }>,
): {
  total: number;
  requested: number;
  received: number;
  reviewed: number;
  missing: number;
  readyForUnderwriting: boolean;
} {
  const total = items.length;
  const requested = items.filter((item) => item.status !== OpportunityDiligenceStatus.NOT_REQUESTED).length;
  const received = items.filter((item) =>
    item.status === OpportunityDiligenceStatus.RECEIVED || item.status === OpportunityDiligenceStatus.REVIEWED,
  ).length;
  const reviewed = items.filter((item) => item.status === OpportunityDiligenceStatus.REVIEWED).length;
  const missing = items.filter((item) => item.status === OpportunityDiligenceStatus.MISSING).length;
  const coreKeys = new Set(["t12", "rent_roll", "offering_memo"]);
  const coreReviewedOrReceived = items.filter(
    (item) =>
      Boolean(item.key) &&
      coreKeys.has(item.key as string) &&
      (item.status === OpportunityDiligenceStatus.RECEIVED || item.status === OpportunityDiligenceStatus.REVIEWED),
  ).length;

  return {
    total,
    requested,
    received,
    reviewed,
    missing,
    readyForUnderwriting: missing === 0 && coreReviewedOrReceived >= 3,
  };
}
