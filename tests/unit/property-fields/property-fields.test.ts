import { test } from "node:test";
import assert from "node:assert/strict";

import { PROPERTY_PROJECTED_FIELDS, isPropertyProjectedField, normalizePropertyValue } from "../../../lib/intelligence/property-fields";

test("the projected set is exactly yearBuilt + squareFeet", () => {
  assert.deepEqual([...PROPERTY_PROJECTED_FIELDS], ["yearBuilt", "squareFeet"]);
});

test("isPropertyProjectedField accepts projected fields and rejects others", () => {
  assert.equal(isPropertyProjectedField("yearBuilt"), true);
  assert.equal(isPropertyProjectedField("squareFeet"), true);
  assert.equal(isPropertyProjectedField("unitCount"), false); // operational, not projected
  assert.equal(isPropertyProjectedField("capRate"), false);
  assert.equal(isPropertyProjectedField(""), false);
});

test("normalizePropertyValue canonicalizes valid integers and strips separators", () => {
  assert.equal(normalizePropertyValue("squareFeet", "50000"), "50000");
  assert.equal(normalizePropertyValue("squareFeet", "50,000"), "50000");
  assert.equal(normalizePropertyValue("squareFeet", " 1 200 "), "1200");
  assert.equal(normalizePropertyValue("yearBuilt", "1998"), "1998");
});

test("normalizePropertyValue rejects non-numeric input", () => {
  assert.equal(normalizePropertyValue("squareFeet", "abc"), null);
  assert.equal(normalizePropertyValue("squareFeet", ""), null);
  assert.equal(normalizePropertyValue("squareFeet", "12.5"), null); // no decimals — integer columns
  assert.equal(normalizePropertyValue("yearBuilt", "-5"), null); // leading minus is non-digit
});

test("yearBuilt is bounded to a plausible range; squareFeet is not", () => {
  assert.equal(normalizePropertyValue("yearBuilt", "1599"), null); // below lower bound
  assert.equal(normalizePropertyValue("yearBuilt", "1600"), "1600"); // lower bound inclusive
  assert.equal(normalizePropertyValue("yearBuilt", "2100"), "2100"); // upper bound inclusive
  assert.equal(normalizePropertyValue("yearBuilt", "2101"), null); // above upper bound
  assert.equal(normalizePropertyValue("squareFeet", "9000000"), "9000000"); // no upper bound
});
