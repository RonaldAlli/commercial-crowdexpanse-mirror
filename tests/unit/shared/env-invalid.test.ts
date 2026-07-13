import { test } from "node:test";
import assert from "node:assert/strict";

import { getEnv } from "../../../lib/env";

// A throwing getEnv() does not cache, so several invalid scenarios can share one
// process. Each clears the module cache implicitly by never succeeding.
function reset() {
  for (const k of ["EMAIL_PROVIDER", "EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE"]) {
    delete process.env[k];
  }
}

test("an unknown EMAIL_PROVIDER is rejected", () => {
  reset();
  process.env.EMAIL_PROVIDER = "carrier-pigeon";
  assert.throws(() => getEnv(), /EMAIL_PROVIDER/);
});

test("smtp provider with a missing credential fails fast", () => {
  reset();
  process.env.EMAIL_PROVIDER = "smtp";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "u";
  process.env.SMTP_PASS = "p";
  // SMTP_HOST intentionally missing
  assert.throws(() => getEnv(), /SMTP_HOST/);
});

test("smtp provider with a non-numeric port is rejected", () => {
  reset();
  process.env.EMAIL_PROVIDER = "smtp";
  process.env.SMTP_HOST = "h";
  process.env.SMTP_PORT = "not-a-port";
  process.env.SMTP_USER = "u";
  process.env.SMTP_PASS = "p";
  assert.throws(() => getEnv(), /SMTP_PORT/);
});
