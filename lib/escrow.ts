// Closing Center Slice 2 — Escrow: the PURE core. Owns the deterministic lifecycle guard
// (EC-B/EC-8) and the immutable terminal-snapshot builder (EC-I). NO Prisma, NO clock, NO
// I/O — escrow is human workflow, but its transition rules and snapshot shape are pure
// functions so they are unit-testable and can never disagree with the service/UI. Escrow
// never participates in the underwriting engine (EC-1/EC-9/EC-10). Design authority:
// docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md (Slice 2 — Escrow).
import type { EscrowStatus, EscrowEventType } from "@prisma/client";

import type { Tone } from "@/components/ui/badge";

/** The terminal money outcomes — once here, the record is frozen (EC-11). */
export const TERMINAL_ESCROW_STATUSES: EscrowStatus[] = ["RELEASED", "REFUNDED", "FORFEITED"];

export function isTerminalEscrowStatus(status: EscrowStatus): boolean {
  return TERMINAL_ESCROW_STATUSES.includes(status);
}

// The only permitted forward transitions (EC-B). A terminal status has no outgoing edges
// (frozen, EC-11); NOT_OPENED must be OPENED before a deposit; a deposit precedes any
// resolution. Everything else is rejected by the guard below.
const ALLOWED_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  NOT_OPENED: ["OPENED"],
  OPENED: ["DEPOSITED"],
  DEPOSITED: ["RELEASED", "REFUNDED", "FORFEITED"],
  RELEASED: [],
  REFUNDED: [],
  FORFEITED: [],
};

/** EC-8: is moving `from` → `to` a legal escrow transition? Pure, total, side-effect-free. */
export function isValidEscrowTransition(from: EscrowStatus, to: EscrowStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The immutable-event type for a terminal status, or null when the status is not terminal. */
export function escrowEventTypeFor(status: EscrowStatus): EscrowEventType | null {
  return isTerminalEscrowStatus(status) ? (status as EscrowEventType) : null;
}

/** The minimal record fields the terminal snapshot copies (EC-I). */
export type EscrowSnapshotSource = {
  earnestAmountUsd: number | null;
  escrowHolderName: string | null;
  proofOfDepositDocumentId: string | null;
};

export type EscrowSnapshot = {
  type: EscrowEventType;
  amountUsdSnapshot: number | null;
  holderNameSnapshot: string | null;
  proofDocumentIdSnapshot: string | null;
  actorId: string;
  reason: string | null;
};

/**
 * Build the immutable EscrowEvent payload from the record AT RESOLUTION TIME (EC-I). Copying
 * the amount/holder/proof here — rather than referencing the mutable record — is what makes a
 * terminal event a durable historical fact no later edit can rewrite (EC-11).
 */
export function buildEscrowSnapshot(
  source: EscrowSnapshotSource,
  type: EscrowEventType,
  actorId: string,
  reason: string | null,
): EscrowSnapshot {
  const trimmed = reason?.trim();
  return {
    type,
    amountUsdSnapshot: source.earnestAmountUsd,
    holderNameSnapshot: source.escrowHolderName,
    proofDocumentIdSnapshot: source.proofOfDepositDocumentId,
    actorId,
    reason: trimmed ? trimmed : null,
  };
}

// --- display helpers ----------------------------------------------------------

const STATUS_LABELS: Record<EscrowStatus, string> = {
  NOT_OPENED: "Not opened",
  OPENED: "Opened",
  DEPOSITED: "Deposited",
  RELEASED: "Released",
  REFUNDED: "Refunded",
  FORFEITED: "Forfeited",
};

export function escrowStatusLabel(status: string): string {
  return STATUS_LABELS[status as EscrowStatus] ?? status;
}

export function escrowStatusTone(status: string): Tone {
  switch (status) {
    case "DEPOSITED":
    case "RELEASED":
      return "success";
    case "REFUNDED":
      return "warning";
    case "FORFEITED":
      return "danger";
    case "OPENED":
      return "info";
    default:
      return "neutral";
  }
}
