// Commercial Intelligence (v1.2, Commit 1d-3b) — deterministic merge-winner
// suggestion. PURE and ADVISORY ONLY: it proposes which owner of a confirmed
// duplicate pair should survive a merge, but never performs the merge and is
// never silently applied — an ADMIN must explicitly confirm or swap the winner.
//
// The heuristic is intentionally simple, explainable, and PROVIDER-NEUTRAL:
//   1. greater total linked-record count (sellers + properties) wins;
//   2. else the older record (earlier createdAt) wins;
//   3. else the lexicographically smaller owner id wins (a stable final tiebreak).
// External identifiers / provider evidence are deliberately EXCLUDED — provider
// coverage must not decide canonical ownership.

export type MergeSuggestInput = {
  id: string;
  sellerCount: number;
  propertyCount: number;
  createdAt: Date;
};

export type MergeSuggestion = {
  winnerId: string;
  loserId: string;
  /** A short, human-readable justification for the suggested winner. */
  reason: string;
};

const total = (o: MergeSuggestInput) => o.sellerCount + o.propertyCount;

/**
 * Suggest the surviving (winner) owner for a duplicate pair. Deterministic and
 * symmetric: suggestWinner(a, b) and suggestWinner(b, a) name the same winner.
 * Advisory only — the caller must have an ADMIN confirm/swap before merging.
 */
export function suggestWinner(a: MergeSuggestInput, b: MergeSuggestInput): MergeSuggestion {
  const win = (winner: MergeSuggestInput, loser: MergeSuggestInput, reason: string): MergeSuggestion => ({
    winnerId: winner.id,
    loserId: loser.id,
    reason,
  });

  const ta = total(a);
  const tb = total(b);
  if (ta !== tb) {
    const [w, l] = ta > tb ? [a, b] : [b, a];
    return win(w, l, `More linked records (${total(w)} vs ${total(l)})`);
  }

  const ca = a.createdAt.getTime();
  const cb = b.createdAt.getTime();
  if (ca !== cb) {
    const [w, l] = ca < cb ? [a, b] : [b, a];
    return win(w, l, `Same linked-record count (${ta}); older record kept`);
  }

  const [w, l] = a.id < b.id ? [a, b] : [b, a];
  return win(w, l, `Identical record count and age; kept by stable id order`);
}
