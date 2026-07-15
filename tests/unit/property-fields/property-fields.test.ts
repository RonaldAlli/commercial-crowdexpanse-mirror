import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROPERTY_PROJECTED_FIELDS,
  PROPERTY_ANCHOR_FIELDS,
  isPropertyProjectedField,
  isPropertyAnchorField,
  propertyFieldType,
  normalizePropertyValue,
} from "../../../lib/intelligence/property-fields";

test("the projected set covers the integer fields and the identity anchors", () => {
  assert.deepEqual([...PROPERTY_PROJECTED_FIELDS], ["yearBuilt", "squareFeet", "apnNormalized", "countyFipsCode", "addressNormalized"]);
  assert.deepEqual([...PROPERTY_ANCHOR_FIELDS], ["apnNormalized", "countyFipsCode", "addressNormalized"]);
});

test("isPropertyProjectedField accepts projected fields (integers + anchors) and rejects others", () => {
  for (const f of ["yearBuilt", "squareFeet", "apnNormalized", "countyFipsCode", "addressNormalized"]) {
    assert.equal(isPropertyProjectedField(f), true);
  }
  assert.equal(isPropertyProjectedField("unitCount"), false); // operational, not projected
  assert.equal(isPropertyProjectedField("capRate"), false);
  assert.equal(isPropertyProjectedField(""), false);
});

test("isPropertyAnchorField distinguishes anchors from integer projected fields", () => {
  for (const f of ["apnNormalized", "countyFipsCode", "addressNormalized"]) assert.equal(isPropertyAnchorField(f), true);
  assert.equal(isPropertyAnchorField("yearBuilt"), false);
  assert.equal(isPropertyAnchorField("squareFeet"), false);
  assert.equal(isPropertyAnchorField("unitCount"), false);
});

test("propertyFieldType reports the declared value type", () => {
  assert.equal(propertyFieldType("yearBuilt"), "integer");
  assert.equal(propertyFieldType("squareFeet"), "integer");
  assert.equal(propertyFieldType("apnNormalized"), "string-anchor");
  assert.equal(propertyFieldType("countyFipsCode"), "string-anchor");
  assert.equal(propertyFieldType("addressNormalized"), "string-anchor");
});

test("normalizePropertyValue canonicalizes valid integers and strips separators", () => {
  assert.equal(normalizePropertyValue("squareFeet", "50000"), "50000");
  assert.equal(normalizePropertyValue("squareFeet", "50,000"), "50000");
  assert.equal(normalizePropertyValue("squareFeet", " 1 200 "), "1200");
  assert.equal(normalizePropertyValue("yearBuilt", "1998"), "1998");
});

test("normalizePropertyValue rejects non-numeric integer input", () => {
  assert.equal(normalizePropertyValue("squareFeet", "abc"), null);
  assert.equal(normalizePropertyValue("squareFeet", ""), null);
  assert.equal(normalizePropertyValue("squareFeet", "12.5"), null); // no decimals — integer columns
  assert.equal(normalizePropertyValue("yearBuilt", "-5"), null); // leading minus is non-digit
});

test("yearBuilt is bounded to a plausible range; squareFeet is not", () => {
  assert.equal(normalizePropertyValue("yearBuilt", "1599"), null);
  assert.equal(normalizePropertyValue("yearBuilt", "1600"), "1600");
  assert.equal(normalizePropertyValue("yearBuilt", "2100"), "2100");
  assert.equal(normalizePropertyValue("yearBuilt", "2101"), null);
  assert.equal(normalizePropertyValue("squareFeet", "9000000"), "9000000");
});

test("normalizePropertyValue dispatches anchor fields to their normalizers", () => {
  assert.equal(normalizePropertyValue("apnNormalized", "123-45-678"), "12345678");
  assert.equal(normalizePropertyValue("countyFipsCode", "13121"), "13121");
  assert.equal(normalizePropertyValue("countyFipsCode", "abc"), null);
  assert.equal(normalizePropertyValue("addressNormalized", "123 north main street"), "123 N MAIN ST");
});
