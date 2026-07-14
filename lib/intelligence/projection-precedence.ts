// Commercial Intelligence (v1.2, Commit 1b-2) — pure projection precedence.
//
// Given a field's ACCEPTED signals, pick the single winning value for the typed
// projection. No Prisma; unit-testable. This is the deterministic heart of the
// projection engine — the ordering is TOTAL (a signal-id final tiebreak), so
// there is exactly one winner and the projection is a pure function of the
// ledger (Volume 12 "projection is deterministic").
//
// Precedence (Volume 12 §5): (1) user-override pin → (2) latest asOf →
// (3) highest confidence → (4) source-category → (5) signal id.

/** Source-category precedence — lower rank wins the tiebreak. */
export const SOURCE_CATEGORY_RANK: Record<string, number> = {
  USER_ENTERED: 0,
  LICENSED: 1,
  PUBLIC: 2,
  CALCULATION: 3,
  AI_DERIVED: 4,
};

export interface PrecedenceSignal {
  id: string;
  isOverride: boolean;
  asOf: Date | string;
  confidence: number;
  sourceCategory: string;
}

/** Total-order comparator: returns <0 if a outranks b (a should sort first). */
export function compareSignals(a: PrecedenceSignal, b: PrecedenceSignal): number {
  if (a.isOverride !== b.isOverride) return a.isOverride ? -1 : 1; // 1. pin first
  const at = new Date(a.asOf).getTime();
  const bt = new Date(b.asOf).getTime();
  if (at !== bt) return bt - at; // 2. latest asOf first
  if (a.confidence !== b.confidence) return b.confidence - a.confidence; // 3. highest confidence
  const ar = SOURCE_CATEGORY_RANK[a.sourceCategory] ?? 99;
  const br = SOURCE_CATEGORY_RANK[b.sourceCategory] ?? 99;
  if (ar !== br) return ar - br; // 4. source-category precedence
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // 5. signal id — final deterministic tiebreak
}

/** The winning signal among an ACCEPTED set, or null if the set is empty. */
export function selectWinner<T extends PrecedenceSignal>(signals: readonly T[]): T | null {
  if (signals.length === 0) return null;
  return [...signals].sort(compareSignals)[0];
}
