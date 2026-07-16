// Closing Center Slice 4 — Assignments: the PURE core. Owns the deterministic lifecycle guard
// (AS-B/AS-9) and the terminal execution-snapshot builder (AS-D/AS-H). NO Prisma, NO clock, NO
// I/O. Assignments are human operational tracking of the wholesale transaction — they never
// participate in the underwriting engine and never own the fee's source of truth (AS-1/AS-3/
// AS-13). Design authority: docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md (Slice 4).
import type { AssignmentStatus } from "@prisma/client";

import type { Tone } from "@/components/ui/badge";

/** Terminal outcomes — once here, the record is frozen (AS-4/AS-H). */
export const TERMINAL_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["EXECUTED", "CANCELLED"];

export function isTerminalAssignmentStatus(status: AssignmentStatus): boolean {
  return TERMINAL_ASSIGNMENT_STATUSES.includes(status);
}

// The permitted transitions (AS-B). Lean: draft the agreement, then execute — with a CANCELLED
// off-ramp reachable from either active state; terminals are frozen (no edges). No e-sign states.
const ALLOWED_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  NOT_STARTED: ["DRAFTED", "CANCELLED"],
  DRAFTED: ["EXECUTED", "CANCELLED"],
  EXECUTED: [],
  CANCELLED: [],
};

/** AS-9: is moving `from` → `to` a legal assignment transition? Pure, total, side-effect-free. */
export function isValidAssignmentTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Execution requires a drafted agreement first — DRAFTED is the only state EXECUTED is reachable from. */
export function canExecuteFrom(status: AssignmentStatus): boolean {
  return isValidAssignmentTransition(status, "EXECUTED");
}

/** The minimal, already-resolved data the execution snapshot copies (AS-D/AS-H). */
export type AssignmentSnapshotSource = {
  assignmentFeeUsd: number | null;
  contractValueUsd: number | null;
  assignorName: string | null; // effective name (free-text or resolved Seller), computed by the service
  assigneeName: string | null; // effective name (free-text or resolved Buyer)
  agreementDocumentId: string | null; // the executed draft's generated Document id
};

export type AssignmentExecutionSnapshot = {
  executedFeeUsdSnapshot: number | null;
  executedContractValueUsdSnapshot: number | null;
  executedAssignorNameSnapshot: string | null;
  executedAssigneeNameSnapshot: string | null;
  executedAgreementDocumentIdSnapshot: string | null;
};

/**
 * Build the EXECUTED snapshot from the record + opportunity AT execution time (AS-D/AS-H) —
 * captured inside the AssignmentRecord (no separate ledger, AS-H) so the executed terms are a
 * durable historical fact a later edit could not rewrite (the record also freezes). The fee's
 * source of truth stays on the Opportunity (AS-3); this only copies the value at that instant.
 */
export function buildAssignmentExecutionSnapshot(source: AssignmentSnapshotSource): AssignmentExecutionSnapshot {
  return {
    executedFeeUsdSnapshot: source.assignmentFeeUsd,
    executedContractValueUsdSnapshot: source.contractValueUsd,
    executedAssignorNameSnapshot: source.assignorName,
    executedAssigneeNameSnapshot: source.assigneeName,
    executedAgreementDocumentIdSnapshot: source.agreementDocumentId,
  };
}

// --- display helpers ----------------------------------------------------------

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  NOT_STARTED: "Not started",
  DRAFTED: "Drafted",
  EXECUTED: "Executed",
  CANCELLED: "Cancelled",
};

export function assignmentStatusLabel(status: string): string {
  return STATUS_LABELS[status as AssignmentStatus] ?? status;
}

export function assignmentStatusTone(status: string): Tone {
  switch (status) {
    case "EXECUTED":
      return "success";
    case "DRAFTED":
      return "info";
    case "CANCELLED":
      return "warning";
    case "NOT_STARTED":
    default:
      return "neutral";
  }
}
