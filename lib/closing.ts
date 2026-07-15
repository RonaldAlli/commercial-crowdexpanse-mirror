// Closing Center (v1.4) — the PURE core. Owns the deterministic PAID-gate predicate
// and the default checklist template data. NO Prisma, NO clock, NO I/O — closing is
// human workflow, but the gate itself is a pure function of item state so it is
// unit-testable and composes cleanly with the role gate (CC-C/CC-3). Design authority:
// docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md.
import type { ChecklistItemCategory, ChecklistItemStatus, CompletionEvidenceType } from "@prisma/client";

/** The minimal item shape the gate reads — only what determines readiness. */
export type GateItem = { required: boolean; status: ChecklistItemStatus };

/**
 * CC-2/CC-C: a checklist is "closing-ready" iff every REQUIRED item is COMPLETE or
 * WAIVED. Non-required items never block; a required item in PENDING (or NOT_APPLICABLE,
 * which is not a valid state for a required item) blocks. Pure — no side effects.
 */
export function isClosingReady(items: GateItem[]): boolean {
  return items.every((i) => !i.required || i.status === "COMPLETE" || i.status === "WAIVED");
}

/** The required items that still block the PAID gate (for surfacing "what's left"). */
export function blockingItems<T extends GateItem>(items: T[]): T[] {
  return items.filter((i) => i.required && i.status !== "COMPLETE" && i.status !== "WAIVED");
}

/**
 * A human-readable explanation of WHY the PAID gate is blocked — the labels of the
 * required items still outstanding — or `null` when the checklist is ready. Built on
 * blockingItems() so the message can never disagree with the gate. Pure; used by the
 * server action (the enforcement path carries its own reason) and the detail UI.
 */
export function closingBlockMessage<T extends GateItem & { label: string }>(items: T[]): string | null {
  const outstanding = blockingItems(items).map((i) => i.label);
  if (outstanding.length === 0) return null;
  const noun = outstanding.length === 1 ? "item" : "items";
  return `Cannot move to Paid — ${outstanding.length} required ${noun} outstanding: ${outstanding.join(", ")}`;
}

/** Progress summary for the UI: how many required items are satisfied. */
export function closingProgress(items: GateItem[]): { requiredTotal: number; requiredSatisfied: number; ready: boolean } {
  const required = items.filter((i) => i.required);
  const satisfied = required.filter((i) => i.status === "COMPLETE" || i.status === "WAIVED").length;
  return { requiredTotal: required.length, requiredSatisfied: satisfied, ready: isClosingReady(items) };
}

/** Whether a target status is a valid transition for an item (guards the service/UI). */
export function isValidStatusTransition(required: boolean, target: ChecklistItemStatus): boolean {
  // A REQUIRED item is never NOT_APPLICABLE — removing it from the gate is a WAIVE
  // (explicit, reasoned, ADMIN-audited per CC-5), never a silent N/A.
  if (required && target === "NOT_APPLICABLE") return false;
  return true;
}

// --- default template data (CC-G: data, not hardcoded logic) ------------------

export type TemplateItemSeed = {
  category: ChecklistItemCategory;
  label: string;
  description?: string;
  required: boolean;
  completionEvidenceType: CompletionEvidenceType;
};

/**
 * The default closing checklist an organization gets on first use. It is seeded into a
 * real `ClosingChecklistTemplate` row (editable in a later slice) and SNAPSHOTTED into
 * each Opportunity's checklist (CC-10) — so this is a starting point, never a runtime
 * hardcode. Slice 1 ships the DUE_DILIGENCE category; later slices extend the template.
 */
export const DEFAULT_CLOSING_TEMPLATE: { name: string; items: TemplateItemSeed[] } = {
  name: "Standard Closing Checklist",
  items: [
    { category: "DUE_DILIGENCE", label: "Title search & review", required: true, completionEvidenceType: "DOCUMENT" },
    { category: "DUE_DILIGENCE", label: "Property inspection", required: true, completionEvidenceType: "DOCUMENT" },
    { category: "DUE_DILIGENCE", label: "Financials / T12 verification", required: true, completionEvidenceType: "DOCUMENT" },
    { category: "DUE_DILIGENCE", label: "Legal / contract review", required: true, completionEvidenceType: "MANUAL" },
    { category: "DUE_DILIGENCE", label: "Environmental review", required: false, completionEvidenceType: "DOCUMENT" },
  ],
};
