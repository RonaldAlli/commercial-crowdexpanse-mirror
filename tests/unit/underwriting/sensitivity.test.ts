import { test } from "node:test";
import assert from "node:assert/strict";

import {
  axisValues,
  buildGrid,
  round4,
  validateSensitivitySpec,
  SENSITIVITY_METRICS,
  SENSITIVITY_AXIS_MAX,
  SENSITIVITY_CELL_MAX,
  type SensitivitySpec,
} from "../../../lib/underwriting/sensitivity";

// --- axisValues (SE-5: deterministic, evenly spaced) -------------------------
test("axisValues divides the closed interval into steps-1 equal gaps", () => {
  assert.deepEqual(axisValues(6, 10, 5), [6, 7, 8, 9, 10]);
  assert.deepEqual(axisValues(0, 1, 3), [0, 0.5, 1]);
  assert.deepEqual(axisValues(1_000_000, 1_200_000, 3), [1_000_000, 1_100_000, 1_200_000]);
});

test("axisValues with one step is the degenerate single value", () => {
  assert.deepEqual(axisValues(8, 8, 1), [8]);
  assert.deepEqual(axisValues(8, 99, 1), [8]); // max ignored when steps===1
});

test("axisValues is deterministic — identical inputs give identical ordered values (SE-5)", () => {
  assert.deepEqual(axisValues(5, 7, 4), axisValues(5, 7, 4));
});

test("axisValues rounds to 4 decimals to kill float noise", () => {
  // 6 + (4/6)*i has repeating decimals; each is round4'd.
  assert.deepEqual(axisValues(6, 10, 4), [6, 7.3333, 8.6667, 10]);
});

test("axisValues rejects out-of-range or non-integer step counts", () => {
  assert.throws(() => axisValues(0, 1, 0));
  assert.throws(() => axisValues(0, 1, SENSITIVITY_AXIS_MAX + 1));
  assert.throws(() => axisValues(0, 1, 2.5));
});

test("round4 rounds half-up to four decimals", () => {
  assert.equal(round4(1.23456), 1.2346);
  assert.equal(round4(8), 8);
});

// --- buildGrid (SE-4/SE-6) ---------------------------------------------------
const identity = (x: number, y: number | null) => (y == null ? x : x + y);

test("buildGrid emits one cell per (yIndex,xIndex) in y-outer,x-inner order", () => {
  const cells = buildGrid({ xValues: [1, 2], yValues: [10, 20], evaluate: identity, baselineX: null, baselineY: null });
  assert.deepEqual(
    cells.map((c) => [c.yIndex, c.xIndex, c.xValue, c.yValue, c.metricValue]),
    [
      [0, 0, 1, 10, 11],
      [0, 1, 2, 10, 12],
      [1, 0, 1, 20, 21],
      [1, 1, 2, 20, 22],
    ],
  );
});

test("buildGrid one-axis: yValue null, yIndex 0, evaluate(x,null)", () => {
  const cells = buildGrid({ xValues: [3, 5], yValues: null, evaluate: identity, baselineX: null, baselineY: null });
  assert.equal(cells.length, 2);
  assert.deepEqual(cells.map((c) => [c.xValue, c.yValue, c.metricValue, c.yIndex]), [
    [3, null, 3, 0],
    [5, null, 5, 0],
  ]);
});

test("buildGrid marks the baseline cell ONLY on exact match of BOTH axes (SE-6)", () => {
  const cells = buildGrid({ xValues: [1, 2, 3], yValues: [10, 20], evaluate: identity, baselineX: 2, baselineY: 20 });
  const marked = cells.filter((c) => c.isBaseline);
  assert.equal(marked.length, 1);
  assert.deepEqual([marked[0].xValue, marked[0].yValue], [2, 20]);
});

test("buildGrid marks NO baseline when the baseline value is off the grid (never snaps, SE-6)", () => {
  // baselineX=2.5 lands between generated values → no exact match → no mark.
  const cells = buildGrid({ xValues: [1, 2, 3], yValues: [10, 20], evaluate: identity, baselineX: 2.5, baselineY: 20 });
  assert.equal(cells.filter((c) => c.isBaseline).length, 0);
});

test("buildGrid marks NO baseline when only one of two axes matches (SE-6)", () => {
  const cells = buildGrid({ xValues: [1, 2], yValues: [10, 20], evaluate: identity, baselineX: 2, baselineY: 99 });
  assert.equal(cells.filter((c) => c.isBaseline).length, 0);
});

test("buildGrid one-axis marks the baseline on X match alone", () => {
  const cells = buildGrid({ xValues: [1, 2, 3], yValues: null, evaluate: identity, baselineX: 3, baselineY: null });
  const marked = cells.filter((c) => c.isBaseline);
  assert.equal(marked.length, 1);
  assert.equal(marked[0].xValue, 3);
});

test("buildGrid marks nothing when baselineX is null", () => {
  const cells = buildGrid({ xValues: [1, 2], yValues: null, evaluate: identity, baselineX: null, baselineY: null });
  assert.equal(cells.filter((c) => c.isBaseline).length, 0);
});

test("buildGrid preserves a null metric reading (infeasible cell)", () => {
  const cells = buildGrid({ xValues: [1, 2], yValues: null, evaluate: (x) => (x === 1 ? null : x), baselineX: null, baselineY: null });
  assert.equal(cells[0].metricValue, null);
  assert.equal(cells[1].metricValue, 2);
});

// --- validateSensitivitySpec (D-C allow-lists + caps) ------------------------
const baseSpec: SensitivitySpec = {
  targetMetric: "LEVERED_IRR_PCT",
  xKey: "EXIT_CAP_RATE_PCT",
  xMin: 6,
  xMax: 10,
  xSteps: 5,
  yKey: null,
  yMin: null,
  yMax: null,
  ySteps: null,
};

test("a valid one-axis spec passes", () => {
  assert.equal(validateSensitivitySpec(baseSpec), null);
});

test("a valid two-axis spec passes", () => {
  assert.equal(
    validateSensitivitySpec({ ...baseSpec, yKey: "INTEREST_RATE", yMin: 5, yMax: 7, ySteps: 3 }),
    null,
  );
});

test("every declared metric is accepted", () => {
  for (const m of SENSITIVITY_METRICS) assert.equal(validateSensitivitySpec({ ...baseSpec, targetMetric: m }), null);
});

test("rejects an unknown metric", () => {
  assert.match(validateSensitivitySpec({ ...baseSpec, targetMetric: "NOPE" as never }) ?? "", /metric/);
});

test("rejects an X key outside the axis allow-list", () => {
  assert.match(validateSensitivitySpec({ ...baseSpec, xKey: "UNIT_COUNT" as never }) ?? "", /X axis/);
});

test("rejects bad X step counts", () => {
  assert.match(validateSensitivitySpec({ ...baseSpec, xSteps: 0 }) ?? "", /X axis steps/);
  assert.match(validateSensitivitySpec({ ...baseSpec, xSteps: SENSITIVITY_AXIS_MAX + 1 }) ?? "", /X axis steps/);
  assert.match(validateSensitivitySpec({ ...baseSpec, xSteps: 2.5 }) ?? "", /X axis steps/);
});

test("rejects X max below min, and equal bounds when multi-step", () => {
  assert.match(validateSensitivitySpec({ ...baseSpec, xMin: 10, xMax: 6 }) ?? "", /max/);
  assert.match(validateSensitivitySpec({ ...baseSpec, xMin: 8, xMax: 8, xSteps: 3 }) ?? "", /exceed/);
});

test("allows equal X bounds when there is a single step", () => {
  assert.equal(validateSensitivitySpec({ ...baseSpec, xMin: 8, xMax: 8, xSteps: 1 }), null);
});

test("rejects a Y key outside the allow-list", () => {
  assert.match(validateSensitivitySpec({ ...baseSpec, yKey: "UNIT_COUNT" as never, yMin: 1, yMax: 2, ySteps: 2 }) ?? "", /Y axis/);
});

test("rejects two axes on the same assumption", () => {
  assert.match(
    validateSensitivitySpec({ ...baseSpec, yKey: "EXIT_CAP_RATE_PCT", yMin: 1, yMax: 2, ySteps: 2 }) ?? "",
    /different/,
  );
});

test("rejects a Y axis missing its bounds", () => {
  assert.match(validateSensitivitySpec({ ...baseSpec, yKey: "INTEREST_RATE", yMin: null, yMax: 2, ySteps: 2 }) ?? "", /min, max, and steps/);
});

test("rejects bad Y step counts and inverted/equal Y bounds", () => {
  assert.match(validateSensitivitySpec({ ...baseSpec, yKey: "INTEREST_RATE", yMin: 5, yMax: 7, ySteps: 0 }) ?? "", /Y axis steps/);
  assert.match(validateSensitivitySpec({ ...baseSpec, yKey: "INTEREST_RATE", yMin: 7, yMax: 5, ySteps: 3 }) ?? "", /Y axis max/);
  assert.match(validateSensitivitySpec({ ...baseSpec, yKey: "INTEREST_RATE", yMin: 5, yMax: 5, ySteps: 3 }) ?? "", /exceed/);
});

test("rejects a one-axis spec that still carries Y bounds", () => {
  assert.match(validateSensitivitySpec({ ...baseSpec, yMin: 5 }) ?? "", /one-axis/);
});

test("the largest grid (11 × 11 = 121 cells) is accepted — the cap is enforced by the per-axis bound", () => {
  assert.equal(
    validateSensitivitySpec({ ...baseSpec, xMin: 0, xMax: 10, xSteps: 11, yKey: "INTEREST_RATE", yMin: 5, yMax: 7, ySteps: 11 }),
    null,
  );
  assert.equal(SENSITIVITY_AXIS_MAX * SENSITIVITY_AXIS_MAX, SENSITIVITY_CELL_MAX);
});
