// Business Query Primitives — the reusable business-truth layer. Consumers (UI, reports, exports,
// email, AI) call these; they never re-derive metrics. See BUSINESS_INTELLIGENCE_PRINCIPLES.md.
export {
  revenueByChannel,
  closedWonConversionByChannel,
  buyerCoverageByChannel,
  assignmentRevenueByCampaign,
  revenueByAcquisitionEvent,
} from "./queries";
export { UNKNOWN } from "./types";
export type {
  RevenueByChannelRow,
  ClosedWonConversionRow,
  BuyerCoverageRow,
  AssignmentRevenueByCampaignRow,
  RevenueByAcquisitionEventRow,
} from "./types";
