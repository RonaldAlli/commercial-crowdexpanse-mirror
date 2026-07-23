import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDuration } from "../../../lib/format-duration";

test("formats elapsed seconds as M:SS", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(5), "0:05");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(600), "10:00");
  assert.equal(formatDuration(3599), "59:59");
});

test("clamps negatives and floors fractional seconds", () => {
  assert.equal(formatDuration(-10), "0:00");
  assert.equal(formatDuration(5.9), "0:05");
});
