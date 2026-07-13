import { test } from "node:test";
import assert from "node:assert/strict";

import { getEnv } from "../../../lib/env";

test("smtp provider reads full credentials; port 465 implies secure", () => {
  process.env.EMAIL_PROVIDER = "smtp";
  process.env.EMAIL_FROM = "Ops <ops@example.com>";
  process.env.EMAIL_REPLY_TO = "reply@example.com";
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_USER = "user";
  process.env.SMTP_PASS = "pass";
  delete process.env.SMTP_SECURE; // 465 should still be secure

  const env = getEnv();
  assert.equal(env.email.provider, "smtp");
  assert.equal(env.email.from, "Ops <ops@example.com>");
  assert.equal(env.email.replyTo, "reply@example.com");
  assert.deepEqual(env.email.smtp, {
    host: "smtp.example.com",
    port: 465,
    user: "user",
    pass: "pass",
    secure: true,
  });
});
