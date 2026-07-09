import { DocumentType } from "@prisma/client";

import { titleCase } from "@/lib/property-options";

export const DOCUMENT_TYPE_OPTIONS = Object.values(DocumentType).map((value) => ({
  value,
  label: value === "T12" ? "T12" : titleCase(value),
}));

export function documentTypeLabel(type: string) {
  return type === "T12" ? "T12" : titleCase(type);
}
