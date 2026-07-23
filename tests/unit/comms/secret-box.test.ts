import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { encryptSecret, decryptSecret, maskSecret } from "../../../lib/comms/secret-box";

const KEY = crypto.randomBytes(32).toString("hex");

test("encrypt → decrypt round-trips; ciphertext is not the plaintext", () => {
  const c = encryptSecret("KEY_live_abc123", KEY);
  assert.notEqual(c, "KEY_live_abc123");
  assert.equal(decryptSecret(c, KEY), "KEY_live_abc123");
});

test("random IV → different ciphertext each call for the same input", () => {
  assert.notEqual(encryptSecret("same", KEY), encryptSecret("same", KEY));
});

test("wrong key / tampered ciphertext throws (GCM auth tag)", () => {
  const c = encryptSecret("secret", KEY);
  const otherKey = crypto.randomBytes(32).toString("hex");
  assert.throws(() => decryptSecret(c, otherKey));
});

test("a non-32-byte key is rejected", () => {
  assert.throws(() => encryptSecret("x", "tooshort"));
});

test("maskSecret exposes only the last 4 — never the secret", () => {
  assert.equal(maskSecret("KEY_test1234"), "••••1234");
  assert.equal(maskSecret("ab"), "••••");
});
