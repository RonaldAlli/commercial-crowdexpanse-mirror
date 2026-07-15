// Commercial Underwriting (v1.3, Commit 3b-v) — the pure sensitivity layer. A
// CONSUMER of the engine (Principle 10, SE-1): it generates deterministic axis
// values and, given an `evaluate` closure that re-derives a metric under a cell's
// overrides, assembles a grid of what-if readings. It NEVER mutates a baseline and
// NEVER optimizes (SE-7) — it reports outcomes and marks the baseline cell only
// when the baseline values land EXACTLY on the axes (SE-6). Pure: no Prisma, no
// clock, no randomness — the `evaluate` closure is supplied by the service and is
// itself a pure re-derivation over frozen assumptions.
import { type AssumptionKey, SENSITIVITY_AXIS_KEYS } from "./assumptions";

/** The target metrics a sensitivity grid may report (D-D). Mirrors the Prisma enum. */
export const SENSITIVITY_METRICS = [
  "LEVERED_IRR_PCT",
  "EQUITY_MULTIPLE",
  "TOTAL_PROFIT_USD",
  "CAP_RATE",
  "DSCR",
] as const;

export type SensitivityMetric = (typeof SENSITIVITY_METRICS)[number];

/** Caps (D-A/D-C): at most 11 values per axis and 121 cells per matrix. */
export const SENSITIVITY_AXIS_MAX = 11;
export const SENSITIVITY_CELL_MAX = 121;

/** Round to 4 decimals — the canonical axis precision, so exact baseline comparison
 * (SE-6) is float-noise-free and identical spec → identical values (SE-5). */
export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Deterministic, evenly-spaced axis values (SE-5). `steps` is the NUMBER of values
 * (1..11). One step is the degenerate single-value axis (`[min]`); otherwise the
 * closed interval [min, max] is divided into `steps - 1` equal gaps. Identical
 * (min, max, steps) always yield identical ordered values — no clock, no state.
 */
export function axisValues(min: number, max: number, steps: number): number[] {
  if (!Number.isInteger(steps) || steps < 1 || steps > SENSITIVITY_AXIS_MAX) {
    throw new Error(`sensitivity axis steps must be an integer in 1..${SENSITIVITY_AXIS_MAX}`);
  }
  if (steps === 1) return [round4(min)];
  const out: number[] = [];
  const span = max - min;
  for (let i = 0; i < steps; i++) {
    out.push(round4(min + (span * i) / (steps - 1)));
  }
  return out;
}

/** One derived cell of the grid — a pure what-if reading, never authoritative (SE-4). */
export type GridCell = {
  xIndex: number;
  yIndex: number;
  xValue: number;
  yValue: number | null;
  metricValue: number | null;
  isBaseline: boolean;
};

/**
 * Assemble the grid. `evaluate(xValue, yValue)` re-derives the target metric under
 * this cell's explicit overrides (the caller supplies a pure closure). For a
 * one-axis analysis pass `yValues = null` (each cell has `yValue = null`, `yIndex = 0`).
 *
 * SE-6 — the baseline cell is marked ONLY when the baseline assumption values fall
 * EXACTLY on the generated axes: for a two-axis grid both `baselineX` and `baselineY`
 * must equal a generated value; for one axis only `baselineX` need match. If the
 * baseline does not land on the grid, NO cell is marked (we never snap to nearest).
 */
export function buildGrid(params: {
  xValues: number[];
  yValues: number[] | null;
  evaluate: (xValue: number, yValue: number | null) => number | null;
  baselineX: number | null;
  baselineY: number | null;
}): GridCell[] {
  const { xValues, yValues, evaluate, baselineX, baselineY } = params;
  const cells: GridCell[] = [];
  const bx = baselineX == null ? null : round4(baselineX);
  const by = baselineY == null ? null : round4(baselineY);
  const yList = yValues ?? [null];
  for (let yi = 0; yi < yList.length; yi++) {
    const yValue = yList[yi];
    for (let xi = 0; xi < xValues.length; xi++) {
      const xValue = xValues[xi];
      const xMatch = bx != null && bx === xValue;
      // On a one-axis grid the Y baseline is vacuously satisfied; on a two-axis grid
      // it must land exactly — never snapped (SE-6).
      const yMatch = yValues == null ? true : by != null && yValue != null && by === yValue;
      cells.push({
        xIndex: xi,
        yIndex: yi,
        xValue,
        yValue,
        metricValue: evaluate(xValue, yValue),
        isBaseline: xMatch && yMatch,
      });
    }
  }
  return cells;
}

/** The analyst-authored, presentation-independent spec for a sensitivity grid (D-C). */
export type SensitivitySpec = {
  targetMetric: SensitivityMetric;
  xKey: AssumptionKey;
  xMin: number;
  xMax: number;
  xSteps: number;
  // Y axis is optional (a one-axis analysis omits it).
  yKey: AssumptionKey | null;
  yMin: number | null;
  yMax: number | null;
  ySteps: number | null;
};

function validAxisSteps(steps: unknown): boolean {
  return typeof steps === "number" && Number.isInteger(steps) && steps >= 1 && steps <= SENSITIVITY_AXIS_MAX;
}

/**
 * Validate a sensitivity spec against the fixed allow-lists + caps (D-C, SE-5/SE-7).
 * Returns a human-readable message when invalid, or null when it is safe to build.
 * Pure — no re-derivation, no I/O — so it is unit-testable and callable from both the
 * standalone setter and the replace-whole financing-case path.
 */
export function validateSensitivitySpec(spec: SensitivitySpec): string | null {
  if (!SENSITIVITY_METRICS.includes(spec.targetMetric)) {
    return `Unknown sensitivity metric: ${spec.targetMetric}`;
  }
  if (!SENSITIVITY_AXIS_KEYS.includes(spec.xKey)) {
    return `X axis ${spec.xKey} is not an allowed sensitivity axis`;
  }
  if (!validAxisSteps(spec.xSteps)) {
    return `X axis steps must be an integer in 1..${SENSITIVITY_AXIS_MAX}`;
  }
  if (!(typeof spec.xMin === "number" && typeof spec.xMax === "number") || spec.xMax < spec.xMin) {
    return "X axis max must be greater than or equal to min";
  }
  if (spec.xSteps > 1 && !(spec.xMax > spec.xMin)) {
    return "X axis max must exceed min when it has more than one step";
  }

  const hasY = spec.yKey != null;
  if (hasY) {
    if (!SENSITIVITY_AXIS_KEYS.includes(spec.yKey as AssumptionKey)) {
      return `Y axis ${spec.yKey} is not an allowed sensitivity axis`;
    }
    if (spec.yKey === spec.xKey) {
      return "The two sensitivity axes must be different assumptions";
    }
    if (spec.yMin == null || spec.yMax == null || spec.ySteps == null) {
      return "Y axis requires min, max, and steps";
    }
    if (!validAxisSteps(spec.ySteps)) {
      return `Y axis steps must be an integer in 1..${SENSITIVITY_AXIS_MAX}`;
    }
    if (spec.yMax < spec.yMin) {
      return "Y axis max must be greater than or equal to min";
    }
    if (spec.ySteps > 1 && !(spec.yMax > spec.yMin)) {
      return "Y axis max must exceed min when it has more than one step";
    }
  } else if (spec.yMin != null || spec.yMax != null || spec.ySteps != null) {
    return "A one-axis analysis must not carry Y axis bounds";
  }

  // The 121-cell matrix cap (D-C) is enforced BY CONSTRUCTION: with each axis bounded
  // to SENSITIVITY_AXIS_MAX (11) values, the largest grid is 11 × 11 = SENSITIVITY_CELL_MAX.
  // No separate runtime product check is needed (and one would be an unreachable branch).
  return null;
}
