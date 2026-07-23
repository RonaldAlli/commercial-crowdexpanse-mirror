import type { ContactOutreachStatus } from "@prisma/client";

// Pure qualification checklist shown in the acquisition workspace — a derived guide (no new persistence),
// so it is unit-testable without a database.
export type ChecklistItem = { label: string; done: boolean };

export function sellerQualificationChecklist(input: {
  phone: string | null;
  email: string | null;
  motivation: string | null;
  hasProperty: boolean;
  hasAcquisitionChannel: boolean;
  outreachStatus: ContactOutreachStatus;
}): ChecklistItem[] {
  return [
    { label: "Reachable (phone or email)", done: Boolean(input.phone || input.email) },
    { label: "Acquisition source recorded", done: input.hasAcquisitionChannel },
    { label: "Motivation captured", done: Boolean(input.motivation) },
    { label: "Property linked", done: input.hasProperty },
    { label: "Contact made (Responded or better)", done: input.outreachStatus === "RESPONDED" || input.outreachStatus === "QUALIFIED" },
  ];
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
