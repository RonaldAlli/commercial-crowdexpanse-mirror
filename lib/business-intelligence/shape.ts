import { UNKNOWN } from "./types";

// Pure shaping rules shared by every primitive (unit-tested in isolation, no I/O). These encode the
// frozen rate/ordering/UNKNOWN semantics so no primitive can drift from them.

/** Null/empty attribution → the explicit "UNKNOWN" bucket (never dropped). */
export function normalizeKey(key: string | null | undefined): string {
  return key == null || key === "" ? UNKNOWN : key;
}

/**
 * A rate over DISTINCT population. A zero denominator returns null — no population means
 * "not measurable", NOT zero performance (BI Phase-1 freeze).
 */
export function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Deterministic ordering: highest primary value first, then normalized key alphabetically as the
 * tie-breaker. Null values (not measurable) sort LAST — they are not "worst performance".
 */
export function orderByValueThenKey<T>(rows: T[], value: (row: T) => number | null, key: (row: T) => string): T[] {
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return key(a).localeCompare(key(b));
    if (va === null) return 1; // nulls last
    if (vb === null) return -1;
    if (vb !== va) return vb - va; // value descending
    return key(a).localeCompare(key(b));
  });
}
