// Closing Center Slice 3 — Financing: the PURE core. Owns the deterministic lifecycle guard
// (FC-B/FC-10) and the terminal-snapshot builder (FC-J). NO Prisma, NO clock, NO I/O.
// Financing is human operational tracking of a lender's process — it never participates in
// the underwriting engine's computation and never owns/derives loan economics
// (FC-0/FC-1/FC-3/FC-13/FC-14). Design authority:
// docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md (Slice 3 — Financing).
import type { FinancingStatus } from "@prisma/client";

import type { Tone } from "@/components/ui/badge";

/** Terminal outcomes — once here, the record is frozen (FC-6/FC-J). */
export const TERMINAL_FINANCING_STATUSES: FinancingStatus[] = ["FUNDED", "DENIED", "WITHDRAWN"];

export function isTerminalFinancingStatus(status: FinancingStatus): boolean {
  return TERMINAL_FINANCING_STATUSES.includes(status);
}

// The permitted transitions (FC-B). Forward through the happy path, with DENIED/WITHDRAWN
// off-ramps reachable from the active non-terminal states; terminals are frozen (no edges).
const ALLOWED_TRANSITIONS: Record<FinancingStatus, FinancingStatus[]> = {
  NOT_STARTED: ["APPLIED", "WITHDRAWN"],
  APPLIED: ["COMMITTED", "DENIED", "WITHDRAWN"],
  COMMITTED: ["CLEARED", "DENIED", "WITHDRAWN"],
  CLEARED: ["FUNDED", "DENIED", "WITHDRAWN"],
  FUNDED: [],
  DENIED: [],
  WITHDRAWN: [],
};

/** FC-10: is moving `from` → `to` a legal financing transition? Pure, total, side-effect-free. */
export function isValidFinancingTransition(from: FinancingStatus, to: FinancingStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The minimal record fields the terminal snapshot copies (FC-J). */
export type FinancingSnapshotSource = {
  lenderName: string | null;
  commitmentLetterDocumentId: string | null;
  appraisalDocumentId: string | null;
};

export type FinancingSnapshot = {
  resolutionLenderNameSnapshot: string | null;
  resolutionCommitmentDocumentIdSnapshot: string | null;
  resolutionAppraisalDocumentIdSnapshot: string | null;
  resolvedById: string;
  resolutionReason: string | null;
};

/**
 * Build the FC-J terminal snapshot from the record AT RESOLUTION TIME — captured inside the
 * FinancingRecord itself (there is no separate event ledger, FC-I) so a terminal outcome is a
 * durable historical fact that a later edit could not rewrite (the record also freezes).
 */
export function buildFinancingSnapshot(
  source: FinancingSnapshotSource,
  actorId: string,
  reason: string | null,
): FinancingSnapshot {
  const trimmed = reason?.trim();
  return {
    resolutionLenderNameSnapshot: source.lenderName,
    resolutionCommitmentDocumentIdSnapshot: source.commitmentLetterDocumentId,
    resolutionAppraisalDocumentIdSnapshot: source.appraisalDocumentId,
    resolvedById: actorId,
    resolutionReason: trimmed ? trimmed : null,
  };
}

// --- display helpers ----------------------------------------------------------

const STATUS_LABELS: Record<FinancingStatus, string> = {
  NOT_STARTED: "Not started",
  APPLIED: "Applied",
  COMMITTED: "Committed",
  CLEARED: "Clear to close",
  FUNDED: "Funded",
  DENIED: "Denied",
  WITHDRAWN: "Withdrawn",
};

export function financingStatusLabel(status: string): string {
  return STATUS_LABELS[status as FinancingStatus] ?? status;
}

export function financingStatusTone(status: string): Tone {
  switch (status) {
    case "FUNDED":
    case "CLEARED":
      return "success";
    case "COMMITTED":
    case "APPLIED":
      return "info";
    case "DENIED":
      return "danger";
    case "WITHDRAWN":
      return "warning";
    case "NOT_STARTED":
    default:
      return "neutral";
  }
}
