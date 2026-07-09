import { OpportunityStage } from "@prisma/client";

import { titleCase } from "@/lib/property-options";

// Server-only (imports the Prisma enum). Pages pass these plain arrays to the
// client OpportunityForm / StageSelect so Prisma never enters the client bundle.

export const STAGE_OPTIONS = Object.values(OpportunityStage).map((value) => ({
  value,
  label: titleCase(value),
}));

// Declaration order in the enum is the pipeline order, left-to-right.
export const STAGE_ORDER = Object.values(OpportunityStage);

export const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"];

export function stageLabel(stage: string) {
  return titleCase(stage);
}
