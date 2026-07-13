import { test } from "node:test";
import assert from "node:assert/strict";

import { renderTemplate } from "../../../lib/email/templates/index";

test("system_alert renders subject/html/text from data", () => {
  const r = renderTemplate("system_alert", { heading: "Disk full", message: "Free up space.", orgName: "Acme" });
  assert.equal(r.subject, "Disk full");
  assert.ok(r.html.includes("Free up space.") && r.html.includes("<html"));
  assert.ok(r.html.includes("Acme"));
  assert.ok(r.text.includes("Disk full") && r.text.includes("Free up space."));
  assert.equal(r.version, 1);
});

test("system_alert falls back to a default heading and empty message", () => {
  const r = renderTemplate("system_alert", { heading: "  ", message: "  " });
  assert.equal(r.subject, "System notice");
});

test("invitation renders an absolute accept URL, role, and expiry", () => {
  const r = renderTemplate("invitation", {
    orgName: "Acme",
    inviterName: "Ada",
    role: "Acquisitions",
    acceptUrl: "https://app.example.com/invite/TOK",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  assert.ok(r.subject.includes("Acme"));
  assert.ok(r.html.includes("https://app.example.com/invite/TOK"));
  assert.ok(r.html.includes("Ada")); // inviter named
  assert.ok(r.text.includes("https://app.example.com/invite/TOK"));
  assert.match(r.text, /expires in 7 days/);
});

test("invitation without an inviter uses the passive phrasing", () => {
  const r = renderTemplate("invitation", {
    orgName: "Acme",
    role: "Analyst",
    acceptUrl: "https://app.example.com/invite/T2",
    expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
  });
  assert.ok(r.html.includes("You've been invited"));
  assert.match(r.text, /expires in 1 day\b/); // singular
});

test("invitation escapes HTML in interpolated fields", () => {
  const r = renderTemplate("invitation", {
    orgName: "<script>",
    role: "Analyst",
    acceptUrl: "https://x/invite/T",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  assert.ok(!r.html.includes("<script>"));
  assert.ok(r.html.includes("&lt;script&gt;"));
});
