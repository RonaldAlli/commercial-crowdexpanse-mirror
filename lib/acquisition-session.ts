// Acquisition Session — reframes /acquire from "working records" to "working a calling session".
// A session is just a goal + a time window (startedAt..endedAt). Every displayed number is DERIVED from
// authoritative facts logged during the window (calls = CALL touches, appointments = the appointment-set
// disposition, qualified = status-change events) — never a hand-incremented counter (BI Rule 1). This module
// is the PURE part: given the raw fact counts + timestamps, it computes what the session bar shows. No I/O.

export const DEFAULT_SESSION_GOAL = 100;
export const MIN_SESSION_GOAL = 1;
export const MAX_SESSION_GOAL = 1000;

export type SessionFacts = {
  goalCalls: number;
  completed: number; // CALL touches logged in-window by this operator
  appointments: number; // appointment-set dispositions in-window
  qualified: number; // status→Qualified changes in-window
  startedAtMs: number;
  nowMs: number;
};

export type SessionProgress = {
  goalCalls: number;
  completed: number;
  remaining: number;
  appointments: number;
  qualified: number;
  elapsedMs: number;
  /** Realized pace once enough time has passed to be meaningful; null early on to avoid wild numbers. */
  callsPerHour: number | null;
  /** Projected calls by goal-pace vs. realized pace — null until callsPerHour is known. */
  goalReached: boolean;
};

const PACE_MIN_ELAPSED_MS = 5 * 60 * 1000; // don't quote a per-hour rate in the first 5 minutes

export function clampGoal(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_SESSION_GOAL;
  return Math.min(MAX_SESSION_GOAL, Math.max(MIN_SESSION_GOAL, Math.round(raw)));
}

/** Compute everything the session bar renders from raw fact counts. Pure + unit-tested. */
export function deriveSessionProgress(f: SessionFacts): SessionProgress {
  const goalCalls = clampGoal(f.goalCalls);
  const completed = Math.max(0, f.completed);
  const elapsedMs = Math.max(0, f.nowMs - f.startedAtMs);
  const callsPerHour =
    elapsedMs >= PACE_MIN_ELAPSED_MS && completed > 0
      ? Math.round((completed / elapsedMs) * 3_600_000)
      : null;
  return {
    goalCalls,
    completed,
    remaining: Math.max(0, goalCalls - completed),
    appointments: Math.max(0, f.appointments),
    qualified: Math.max(0, f.qualified),
    elapsedMs,
    callsPerHour,
    goalReached: completed >= goalCalls,
  };
}

/** "1h 42m" / "0h 07m" — stable, hydration-safe elapsed label from a millisecond duration. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
