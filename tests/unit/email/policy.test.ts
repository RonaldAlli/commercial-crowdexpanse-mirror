import { test } from "node:test";
import assert from "node:assert/strict";

import { retryPolicyFor } from "../../../lib/email/templates/index";
import { isPermanentSmtpError } from "../../../lib/email/transports/smtp";

test("retry policy is set per message kind", () => {
  assert.equal(retryPolicyFor("invitation"), "inline-only");
  assert.equal(retryPolicyFor("system_alert"), "drainable");
});

test("SMTP auth/envelope errors are permanent", () => {
  assert.equal(isPermanentSmtpError({ code: "EAUTH" }), true);
  assert.equal(isPermanentSmtpError({ code: "EENVELOPE" }), true);
});

test("5xx responses are permanent; 4xx are transient", () => {
  assert.equal(isPermanentSmtpError({ responseCode: 550 }), true);
  assert.equal(isPermanentSmtpError({ responseCode: 421 }), false);
});

test("connection-level errors and unknowns are transient", () => {
  assert.equal(isPermanentSmtpError({ code: "ETIMEDOUT" }), false);
  assert.equal(isPermanentSmtpError({}), false);
  assert.equal(isPermanentSmtpError(undefined), false);
});
