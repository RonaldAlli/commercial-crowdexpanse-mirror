import { test } from "node:test";
import assert from "node:assert/strict";

import { getEnv } from "../../../lib/env";

// getEnv() caches on first read, so each env scenario lives in its own test file
// (node:test runs each file in a separate process → fresh module state).
test("defaults to the console provider and strips a trailing slash from APP_URL", () => {
  delete process.env.EMAIL_PROVIDER;
  delete process.env.SMTP_HOST;
  process.env.APP_URL = "https://app.example.com/";
  const env = getEnv();
  assert.equal(env.email.provider, "console");
  assert.ok(env.email.from.length > 0); // default sender
  assert.equal(env.email.smtp, undefined);
  assert.equal(env.appUrl, "https://app.example.com");
});
