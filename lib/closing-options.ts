import { ChecklistItemCategory, ChecklistItemStatus } from "@prisma/client";

import type { Tone } from "@/components/ui/badge";

// Display-only helpers for the Closing Center (v1.4). Pure label/tone maps — the
// gate logic itself lives in lib/closing.ts (CC-2/CC-3); nothing here decides
// anything. Kept separate so server components and client controls share one source.

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistItemCategory, string> = {
  DUE_DILIGENCE: "Due Diligence",
  ESCROW: "Escrow",
  FINANCING: "Financing",
  ASSIGNMENT: "Assignment",
  LEGAL: "Legal",
  OTHER: "Other",
};

export function checklistCategoryLabel(category: string): string {
  return CHECKLIST_CATEGORY_LABELS[category as ChecklistItemCategory] ?? category;
}

const STATUS_LABELS: Record<ChecklistItemStatus, string> = {
  PENDING: "Pending",
  COMPLETE: "Complete",
  WAIVED: "Waived",
  NOT_APPLICABLE: "N/A",
};

export function checklistStatusLabel(status: string): string {
  return STATUS_LABELS[status as ChecklistItemStatus] ?? status;
}

export function checklistStatusTone(status: string): Tone {
  switch (status) {
    case ChecklistItemStatus.COMPLETE:
      return "success";
    case ChecklistItemStatus.WAIVED:
      return "warning";
    case ChecklistItemStatus.NOT_APPLICABLE:
      return "neutral";
    case ChecklistItemStatus.PENDING:
    default:
      return "info";
  }
}
