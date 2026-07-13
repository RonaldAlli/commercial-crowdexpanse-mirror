import { test } from "node:test";
import assert from "node:assert/strict";

import { hashPassword, verifyPassword } from "../../../lib/password";

test("hash format is scrypt:salt:hash and verifies the same password", () => {
  const stored = hashPassword("correct horse");
  const parts = stored.split(":");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "scrypt");
  assert.equal(verifyPassword("correct horse", stored), true);
});

test("a wrong password does not verify", () => {
  const stored = hashPassword("s3cret");
  assert.equal(verifyPassword("guess", stored), false);
});

test("each hash uses a fresh salt (distinct ciphertext for the same input)", () => {
  assert.notEqual(hashPassword("same"), hashPassword("same"));
});

test("malformed stored values are rejected, not thrown", () => {
  assert.equal(verifyPassword("x", "not-a-hash"), false);
  assert.equal(verifyPassword("x", "bcrypt:salt:hash"), false); // wrong scheme
  assert.equal(verifyPassword("x", "scrypt:salt:00"), false); // length mismatch
});
