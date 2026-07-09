import { AssetType } from "@prisma/client";

// Server-only module (imports the Prisma enum). Pages pass these plain arrays
// down to the client PropertyForm so the client bundle never imports Prisma.

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const ASSET_TYPE_OPTIONS = Object.values(AssetType).map((value) => ({
  value,
  label: titleCase(value),
}));

// Property.status is a free-form string in the schema; these are the curated
// UI choices (not an enum).
export const PROPERTY_STATUSES = [
  "Prospect",
  "Researching",
  "Contacted",
  "Under Evaluation",
  "Under Contract",
  "Closed",
  "Archived",
];
