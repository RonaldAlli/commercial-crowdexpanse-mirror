import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { encryptSecret, decryptSecret, maskSecret } from "../../../lib/comms/secret-box";
import { aiConfigKeyHex, aiEncryptionReady } from "../../../lib/ai/config-secret";
import { assertNoSecret } from "../../../lib/ai/audit";

const KEY = crypto.randomBytes(32).toString("hex"); // 64 hex chars

test("AES-256-GCM roundtrip preserves the plaintext", () => {
  const ct = encryptSecret("sk-ant-secret-value", KEY);
  assert.notEqual(ct, "sk-ant-secret-value");
  assert.equal(decryptSecret(ct, KEY), "sk-ant-secret-value");
});

test("decrypt fails on ciphertext tampering (auth tag)", () => {
  const ct = encryptSecret("payload", KEY);
  const buf = Buffer.from(ct, "base64");
  buf[buf.length - 1] ^= 0xff; // flip a byte in the ciphertext
  assert.throws(() => decryptSecret(buf.toString("base64"), KEY));
});

test("decrypt fails with the wrong key", () => {
  const ct = encryptSecret("payload", KEY);
  const wrong = crypto.randomBytes(32).toString("hex");
  assert.throws(() => decryptSecret(ct, wrong));
});

test("maskSecret never reveals more than the last 4", () => {
  assert.equal(maskSecret("sk-ant-abcdEFGH"), "••••EFGH");
  assert.equal(maskSecret("abc"), "••••");
});

test("aiConfigKeyHex fails closed when the master key is absent/malformed", () => {
  const saved = process.env.AI_CONFIG_ENCRYPTION_KEY;
  try {
    delete process.env.AI_CONFIG_ENCRYPTION_KEY;
    assert.equal(aiEncryptionReady(), false);
    assert.throws(() => aiConfigKeyHex(), /not configured/i);
    process.env.AI_CONFIG_ENCRYPTION_KEY = "tooshort";
    assert.equal(aiEncryptionReady(), false);
    process.env.AI_CONFIG_ENCRYPTION_KEY = KEY;
    assert.equal(aiEncryptionReady(), true);
    assert.equal(aiConfigKeyHex(), KEY);
  } finally {
    if (saved === undefined) delete process.env.AI_CONFIG_ENCRYPTION_KEY;
    else process.env.AI_CONFIG_ENCRYPTION_KEY = saved;
  }
});

test("audit guard refuses secret-looking detail", () => {
  assert.throws(() => assertNoSecret("sk-ant-ABCDEF0123456789"), /secret/i);
  assert.throws(() => assertNoSecret("x".repeat(200)), /secret/i);
  assert.doesNotThrow(() => assertNoSecret("model=claude-sonnet-5 enabled=true"));
  assert.doesNotThrow(() => assertNoSecret(null));
});
