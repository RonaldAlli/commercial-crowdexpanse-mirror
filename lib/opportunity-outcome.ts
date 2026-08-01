// Forecasting Backend Authority G-1 — pure Lost/Dead transition rules (no I/O). ACTIVE is the working state;
// LOST and DEAD are explicit terminal outcomes (never inferred). Per FD-1: marking Lost/Dead requires a reason;
// reactivating a Lost deal is an ordinary (audited) transition; reactivating a Dead deal requires an
// administrator. The service layer adds the realized-deal guard and persistence.

export type OpportunityOutcome = "ACTIVE" | "LOST" | "DEAD";

export type OutcomeDecision = { ok: true } | { ok: false; reason: string };

export function isTerminalOutcome(o: OpportunityOutcome): boolean {
  return o === "LOST" || o === "DEAD";
}

/** Decide whether an outcome transition is permitted. Pure. */
export function decideOutcomeTransition(input: {
  current: OpportunityOutcome;
  target: OpportunityOutcome;
  reason: string | null;
  isAdmin: boolean;
}): OutcomeDecision {
  const { current, target, reason, isAdmin } = input;

  if (current === target) return { ok: false, reason: `Opportunity is already ${target.toLowerCase()}.` };

  // Enter a terminal outcome — always requires an explicit reason (Active Evidence: never inferred).
  if (target === "LOST" || target === "DEAD") {
    if (!reason || !reason.trim()) return { ok: false, reason: "A reason is required to mark an opportunity Lost or Dead." };
    return { ok: true };
  }

  // Reactivate to ACTIVE — audited. Lost is ordinary; Dead requires an administrator (FD-1).
  if (target === "ACTIVE") {
    if (current === "LOST") return { ok: true };
    if (current === "DEAD") return isAdmin ? { ok: true } : { ok: false, reason: "Reactivating a Dead opportunity requires an administrator." };
  }

  return { ok: false, reason: "Unsupported outcome transition." };
}
