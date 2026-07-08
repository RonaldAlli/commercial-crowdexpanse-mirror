import { ActivityRecord, BuyerRecord, FileRecord, NoteRecord, OpportunityRecord, PropertyRecord, SellerRecord, TaskRecord, pipelineStages } from "@/lib/types";

export const sellers: SellerRecord[] = [
  {
    id: "seller-1",
    name: "Marcus Henley",
    company: "Henley Urban Holdings",
    email: "marcus@henleyurban.com",
    phone: "(404) 555-0184",
    market: "Atlanta, GA",
    motivation: "Portfolio simplification before debt reset.",
    warmDeals: 2,
  },
  {
    id: "seller-2",
    name: "Lauren Soto",
    company: "Soto Storage Group",
    email: "lauren@sotostorage.com",
    phone: "(615) 555-0198",
    market: "Nashville, TN",
    motivation: "Open to recap or exit after lease-up plateau.",
    warmDeals: 1,
  },
  {
    id: "seller-3",
    name: "Devon Pace",
    company: "Pace Hospitality",
    email: "devon@pacehospitality.com",
    phone: "(407) 555-0127",
    market: "Orlando, FL",
    motivation: "Needs quick certainty to fund a new development site.",
    warmDeals: 1,
  },
];

export const buyers: BuyerRecord[] = [
  {
    id: "buyer-1",
    name: "Dana Price",
    firm: "Summit Storage Partners",
    focus: ["Self Storage", "Industrial"],
    markets: ["GA", "FL", "TN"],
    range: "$6M - $20M",
    lastTouch: "Yesterday",
    conviction: "Needs yield above 8.5% with operational upside.",
  },
  {
    id: "buyer-2",
    name: "Helen Cross",
    firm: "Cross Ridge Capital",
    focus: ["Multifamily", "Mixed Use"],
    markets: ["GA", "NC", "TX"],
    range: "$10M - $45M",
    lastTouch: "2 days ago",
    conviction: "Prefers urban infill and sub-100 unit communities.",
  },
  {
    id: "buyer-3",
    name: "Samir Patel",
    firm: "Waypoint RV Income",
    focus: ["RV Parks", "Mobile Home Parks", "Land"],
    markets: ["TX", "FL", "AZ"],
    range: "$4M - $18M",
    lastTouch: "Last week",
    conviction: "Moves fast on parks with utility billing upside.",
  },
];

export const properties: PropertyRecord[] = [
  {
    id: "property-1",
    name: "Peachtree Heights Lofts",
    assetType: "Multifamily",
    market: "Atlanta, GA",
    units: 64,
    occupancy: "94%",
    basis: "$10.95M",
    noi: "$1.01M",
    seller: "Marcus Henley",
  },
  {
    id: "property-2",
    name: "Oak Harbor Storage",
    assetType: "Self Storage",
    market: "Nashville, TN",
    units: 412,
    occupancy: "87%",
    basis: "$8.40M",
    noi: "$768K",
    seller: "Lauren Soto",
  },
  {
    id: "property-3",
    name: "Lakeside Motor Lodge",
    assetType: "Hospitality",
    market: "Orlando, FL",
    units: 51,
    occupancy: "81%",
    basis: "$6.75M",
    noi: "$612K",
    seller: "Devon Pace",
  },
];

export const opportunities: OpportunityRecord[] = [
  {
    id: "opp-1",
    name: "Peachtree Heights direct acquisition",
    stage: "Underwriting",
    assetType: "Multifamily",
    market: "Atlanta, GA",
    basis: "$10.95M",
    spread: "$325K assignment",
    seller: "Marcus Henley",
    nextStep: "Validate trailing reimbursements and issue draft LOI.",
  },
  {
    id: "opp-2",
    name: "Oak Harbor storage recap",
    stage: "Rent Roll Received",
    assetType: "Self Storage",
    market: "Nashville, TN",
    basis: "$8.40M",
    spread: "$190K fee target",
    seller: "Lauren Soto",
    nextStep: "Pressure-test move-in assumptions before underwriting.",
  },
  {
    id: "opp-3",
    name: "Lakeside lodge sale-lease bridge",
    stage: "Financials Requested",
    assetType: "Hospitality",
    market: "Orlando, FL",
    basis: "$6.75M",
    spread: "$240K fee target",
    seller: "Devon Pace",
    nextStep: "Collect bank statements and trailing franchise fees.",
  },
];

export const tasks: TaskRecord[] = [
  {
    id: "task-1",
    title: "Validate trailing utility reimbursements",
    owner: "Avery Gaines",
    due: "Jul 11",
    status: "In Progress",
    linkedDeal: "Peachtree Heights direct acquisition",
  },
  {
    id: "task-2",
    title: "Draft LOI terms",
    owner: "Avery Gaines",
    due: "Jul 14",
    status: "Backlog",
    linkedDeal: "Peachtree Heights direct acquisition",
  },
  {
    id: "task-3",
    title: "Request insurance loss runs",
    owner: "Mila Brooks",
    due: "Jul 10",
    status: "Blocked",
    linkedDeal: "Oak Harbor storage recap",
  },
  {
    id: "task-4",
    title: "Match RV buyer pocket for surplus land",
    owner: "Jalen Price",
    due: "Jul 15",
    status: "Complete",
    linkedDeal: "Lakeside lodge sale-lease bridge",
  },
];

export const notes: NoteRecord[] = [
  {
    id: "note-1",
    topic: "Seller pressure point",
    body: "Seller will move quicker if on-site payroll is preserved for 90 days after close.",
    author: "Avery Gaines",
    linkedDeal: "Peachtree Heights direct acquisition",
    time: "Today at 8:42 AM",
  },
  {
    id: "note-2",
    topic: "Buyer appetite",
    body: "Cross Ridge wants sub-100 unit multifamily with visible common-area refresh upside.",
    author: "Jalen Price",
    linkedDeal: "Peachtree Heights direct acquisition",
    time: "Yesterday at 4:17 PM",
  },
  {
    id: "note-3",
    topic: "Operations watchout",
    body: "Storage manager concessions are distorting in-place rent by roughly 3.1 percent.",
    author: "Mila Brooks",
    linkedDeal: "Oak Harbor storage recap",
    time: "Yesterday at 11:05 AM",
  },
];

export const files: FileRecord[] = [
  {
    id: "file-1",
    name: "T12 - Peachtree Heights.pdf",
    type: "T12",
    linkedDeal: "Peachtree Heights direct acquisition",
    status: "Reviewed",
    uploadedBy: "Marcus Henley",
  },
  {
    id: "file-2",
    name: "Rent Roll - May 2026.xlsx",
    type: "Rent Roll",
    linkedDeal: "Oak Harbor storage recap",
    status: "Pending analyst review",
    uploadedBy: "Lauren Soto",
  },
  {
    id: "file-3",
    name: "Franchise Fees - Q1.csv",
    type: "Other",
    linkedDeal: "Lakeside lodge sale-lease bridge",
    status: "Requested",
    uploadedBy: "Not uploaded",
  },
];

export const activity: ActivityRecord[] = [
  {
    id: "activity-1",
    title: "Moved deal to Underwriting",
    body: "Initial underwriting assumptions cleared after seller delivered the full financial package.",
    actor: "Avery Gaines",
    time: "18 minutes ago",
    tone: "positive",
  },
  {
    id: "activity-2",
    title: "Buyer match created",
    body: "Summit Storage Partners marked as a high-confidence capital partner for Oak Harbor.",
    actor: "Jalen Price",
    time: "54 minutes ago",
    tone: "info",
  },
  {
    id: "activity-3",
    title: "Missing document risk",
    body: "Hospitality seller still has not delivered trailing franchise and payroll detail.",
    actor: "Mila Brooks",
    time: "2 hours ago",
    tone: "alert",
  },
];

export const pipelineBoard = pipelineStages.map((stage) => ({
  stage,
  items: opportunities.filter((opportunity) => opportunity.stage === stage),
}));

export const dashboardStats = [
  {
    label: "Live opportunities",
    value: "18",
    detail: "6 in active underwriting, 2 ready for LOI this week.",
  },
  {
    label: "Gross potential fees",
    value: "$2.48M",
    detail: "Across the current pipeline if every in-flight deal converts.",
  },
  {
    label: "Capital partners engaged",
    value: "27",
    detail: "11 buyers matched in the last 14 days.",
  },
  {
    label: "Documents outstanding",
    value: "9",
    detail: "Mainly rent rolls, trailing utility support, and loss runs.",
  },
];

export const analyzerSnapshot = {
  dealName: "Peachtree Heights direct acquisition",
  purchasePrice: "$10.95M",
  renovationBudget: "$680K",
  closingCosts: "$240K",
  grossIncome: "$1.63M",
  operatingExpenses: "$620K",
  noi: "$1.01M",
  capRate: "9.26%",
  debtYield: "11.7%",
  dscr: "1.47x",
  pricePerUnit: "$171,094",
  analystSummary:
    "The spread works if tax reassessment stays contained and the payroll preservation request is built into transition reserves.",
};
