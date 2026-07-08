export const pipelineStages = [
  "Lead",
  "Seller Contacted",
  "Interested Seller",
  "Financials Requested",
  "T12 Received",
  "Rent Roll Received",
  "Underwriting",
  "Offer Ready",
  "LOI Sent",
  "Under Contract",
  "Buyer Matched",
  "Closing",
  "Paid",
] as const;

export const assetTypes = [
  "Multifamily",
  "Self Storage",
  "RV Parks",
  "Mobile Home Parks",
  "Retail",
  "Office",
  "Industrial",
  "Hospitality",
  "Mixed Use",
  "Land",
] as const;

export type PipelineStage = (typeof pipelineStages)[number];
export type AssetType = (typeof assetTypes)[number];

export type SellerRecord = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  market: string;
  motivation: string;
  warmDeals: number;
};

export type BuyerRecord = {
  id: string;
  name: string;
  firm: string;
  focus: AssetType[];
  markets: string[];
  range: string;
  lastTouch: string;
  conviction: string;
};

export type PropertyRecord = {
  id: string;
  name: string;
  assetType: AssetType;
  market: string;
  units: number;
  occupancy: string;
  basis: string;
  noi: string;
  seller: string;
};

export type OpportunityRecord = {
  id: string;
  name: string;
  stage: PipelineStage;
  assetType: AssetType;
  market: string;
  basis: string;
  spread: string;
  seller: string;
  nextStep: string;
};

export type TaskRecord = {
  id: string;
  title: string;
  owner: string;
  due: string;
  status: "Backlog" | "In Progress" | "Blocked" | "Complete";
  linkedDeal: string;
};

export type NoteRecord = {
  id: string;
  topic: string;
  body: string;
  author: string;
  linkedDeal: string;
  time: string;
};

export type FileRecord = {
  id: string;
  name: string;
  type: string;
  linkedDeal: string;
  status: string;
  uploadedBy: string;
};

export type ActivityRecord = {
  id: string;
  title: string;
  body: string;
  actor: string;
  time: string;
  tone: "info" | "positive" | "alert";
};
