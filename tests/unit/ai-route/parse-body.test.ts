import { test } from "node:test";
import assert from "node:assert/strict";

import { parseBody } from "../../../app/api/ai/copilot/validate";

test("valid minimal request", () => {
  const r = parseBody({ subjectId: "s1", question: "summarize" });
  assert.ok(r);
  assert.equal(r!.subjectId, "s1");
  assert.equal(r!.question, "summarize");
  assert.deepEqual(r!.history, []);
  assert.equal(r!.shortcutId, undefined);
});

test("valid with history + shortcutId; history capped at the last 20", () => {
  const history = Array.from({ length: 25 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  }));
  const r = parseBody({ subjectId: "s1", question: "q", history, shortcutId: "draft-sms" });
  assert.ok(r);
  assert.equal(r!.history.length, 20);
  assert.equal(r!.history[19].content, "m24"); // kept the most recent
  assert.equal(r!.shortcutId, "draft-sms");
});

test("rejects missing or empty subjectId / question", () => {
  assert.equal(parseBody({ question: "q" }), null);
  assert.equal(parseBody({ subjectId: "  ", question: "q" }), null);
  assert.equal(parseBody({ subjectId: "s1", question: "   " }), null);
});

test("rejects malformed history and non-string shortcutId", () => {
  assert.equal(parseBody({ subjectId: "s1", question: "q", history: "nope" }), null);
  assert.equal(parseBody({ subjectId: "s1", question: "q", history: [{ role: "system", content: "x" }] }), null);
  assert.equal(parseBody({ subjectId: "s1", question: "q", history: [{ role: "user", content: 123 }] }), null);
  assert.equal(parseBody({ subjectId: "s1", question: "q", shortcutId: 5 }), null);
});

test("rejects non-object bodies", () => {
  assert.equal(parseBody(null), null);
  assert.equal(parseBody("x"), null);
  assert.equal(parseBody(42), null);
});
