import { test } from "node:test";
import assert from "node:assert/strict";

import { safeInternalPath } from "../../../lib/safe-redirect";

const FB = "/owners";

test("accepts a plain internal path", () => {
  assert.equal(safeInternalPath("/owners/abc", FB), "/owners/abc");
  assert.equal(safeInternalPath("/sellers/1?tab=x", FB), "/sellers/1?tab=x");
});

test("rejects protocol-relative URLs (//host)", () => {
  assert.equal(safeInternalPath("//evil.com", FB), FB);
  assert.equal(safeInternalPath("//evil.com/path", FB), FB);
});

test("rejects absolute external URLs", () => {
  assert.equal(safeInternalPath("https://evil.com", FB), FB);
  assert.equal(safeInternalPath("http://evil.com/x", FB), FB);
});

test("rejects non-slash-prefixed and empty/invalid input", () => {
  assert.equal(safeInternalPath("owners/abc", FB), FB);
  assert.equal(safeInternalPath("", FB), FB);
  assert.equal(safeInternalPath(null, FB), FB);
  assert.equal(safeInternalPath(undefined, FB), FB);
  assert.equal(safeInternalPath(42, FB), FB);
});

test("rejects backslash and embedded-protocol tricks", () => {
  assert.equal(safeInternalPath("/\\evil.com", FB), FB);
  assert.equal(safeInternalPath("/x/javascript://alert", FB), FB);
});

test("rejects control characters (CRLF header/redirect injection)", () => {
  assert.equal(safeInternalPath("/owners\r\nSet-Cookie: x", FB), FB);
  assert.equal(safeInternalPath("/owners\tx", FB), FB);
});
