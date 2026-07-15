import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeApn,
  normalizeFips,
  normalizeAddress,
  propertyIdentityFingerprint,
  APN_NORMALIZATION_VERSION,
  FIPS_NORMALIZATION_VERSION,
  ADDRESS_NORMALIZATION_VERSION,
} from "../../../lib/intelligence/property-normalizers";

test("normalizer versions are stamped", () => {
  assert.equal(APN_NORMALIZATION_VERSION, 1);
  assert.equal(FIPS_NORMALIZATION_VERSION, 1);
  assert.equal(ADDRESS_NORMALIZATION_VERSION, 1);
});

test("normalizeApn upper-cases + strips formatting; empty → null", () => {
  assert.equal(normalizeApn("123-45-678"), "12345678");
  assert.equal(normalizeApn(" a1.b2 c3 "), "A1B2C3");
  assert.equal(normalizeApn("apn-0091"), "APN0091");
  assert.equal(normalizeApn("---"), null);
  assert.equal(normalizeApn(""), null);
});

test("normalizeFips requires exactly 5 digits; leading zeros preserved", () => {
  assert.equal(normalizeFips("13121"), "13121");
  assert.equal(normalizeFips("06075"), "06075"); // leading zero preserved
  assert.equal(normalizeFips("13-121"), "13121"); // strips separators
  assert.equal(normalizeFips("1312"), null); // too short
  assert.equal(normalizeFips("131210"), null); // too long
  assert.equal(normalizeFips("abcde"), null);
  assert.equal(normalizeFips(""), null);
});

test("normalizeAddress collapses case/whitespace/punctuation; empty → null", () => {
  assert.equal(normalizeAddress("  123   Main   St. "), "123 MAIN ST");
  assert.equal(normalizeAddress(""), null);
  assert.equal(normalizeAddress("   "), null);
  assert.equal(normalizeAddress("#"), null); // only a unit marker with no value ⇒ nothing to anchor
});

test("normalizeAddress standardizes directionals and street suffixes", () => {
  assert.equal(normalizeAddress("123 North Main Street"), "123 N MAIN ST");
  assert.equal(normalizeAddress("50 Southwest Peachtree Boulevard"), "50 SW PEACHTREE BLVD");
  assert.equal(normalizeAddress("9 Oak Avenue"), "9 OAK AVE");
  assert.equal(normalizeAddress("7 Elm Road"), "7 ELM RD");
});

test("normalizeAddress extracts units via token, #x, and # x; empty unit ignored", () => {
  assert.equal(normalizeAddress("123 Main St Apt 4B"), "123 MAIN ST UNIT 4B");
  assert.equal(normalizeAddress("123 Main St #4B"), "123 MAIN ST UNIT 4B");
  assert.equal(normalizeAddress("123 Main St # 4B"), "123 MAIN ST UNIT 4B");
  assert.equal(normalizeAddress("123 Main St Suite 200"), "123 MAIN ST UNIT 200");
  assert.equal(normalizeAddress("123 Main St Apt"), "123 MAIN ST"); // trailing unit token, no value
});

test("normalizeAddress normalizes a bare 9-digit ZIP and is idempotent", () => {
  assert.equal(normalizeAddress("123 Main St 303011234"), "123 MAIN ST 30301-1234");
  const once = normalizeAddress("123 north main street apt 4b");
  assert.equal(once, "123 N MAIN ST UNIT 4B");
  assert.equal(normalizeAddress(once), once); // idempotent
});

test("propertyIdentityFingerprint is deterministic and sensitive to every anchor", () => {
  const base = { countyFipsCode: "13121", apnNormalized: "12345678", addressNormalized: "123 N MAIN ST" };
  const fp = propertyIdentityFingerprint(base);
  assert.equal(fp, propertyIdentityFingerprint({ ...base }), "same anchors ⇒ same fingerprint (deterministic)");
  assert.notEqual(fp, propertyIdentityFingerprint({ ...base, apnNormalized: "99999999" }), "APN change flips it");
  assert.notEqual(fp, propertyIdentityFingerprint({ ...base, countyFipsCode: "06075" }), "FIPS change flips it");
  assert.notEqual(fp, propertyIdentityFingerprint({ ...base, addressNormalized: "9 OAK AVE" }), "address change flips it");
  assert.equal(propertyIdentityFingerprint({ countyFipsCode: null, apnNormalized: null, addressNormalized: null }).length, 32, "all-null anchors still yield a fingerprint");
});
