// AI Copilot — vertical integration e2e. Proves the complete request path:
//   runCopilot() → resolve intent → retrieve (REAL, org-scoped, against the *_test
//   DB) → build prompt → stream — with ONLY the external LLM boundary injected (a
//   fake provider, so no network). No internal layer is mocked. Also proves the
//   org boundary: a cross-org subject raises CopilotNotFoundError (the route's 404).
// Runs against the *_test DB (throwaway org, cascade-cleaned).
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { runCopilot } from "../lib/ai/copilot-service.ts";

const TAG = "e2e-ai-copilot";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };

const orgIds = [];
const mkOrg = async () => {
  const o = await prisma.organization.create({
    data: { name: `${TAG} ${process.pid}`, slug: `${TAG}-${process.pid}-${randomUUID().slice(0, 8)}` },
  });
  orgIds.push(o.id);
  return o;
};
// Stands in for requireUser()'s output — the authenticated session's user. org +
// actor scoping flow from here, exactly as in production.
const sessionUser = (org) => ({
  id: `user-${org.id}`,
  name: "Operator",
  email: "op@example.com",
  role: "OWNER",
  organizationId: org.id,
  organizationName: org.name,
  organizationSlug: org.slug,
});

// Fake external LLM boundary — no network. Captures the assembled prompt.
let captured = null;
const fakeLlm = {
  name: "e2e-fake",
  resolveStatus: () => ({ configured: true, reason: null }),
  async *stream(params) {
    captured = params;
    yield "Hello ";
    yield "from the copilot.";
  },
};

async function drain(stream) {
  let out = "";
  for await (const delta of stream) out += delta;
  return out;
}

try {
  const org = await mkOrg();
  const seller = await prisma.seller.create({
    data: {
      organizationId: org.id, name: "Jane Seller", outreachStatus: "CONTACTED",
      motivation: "relocating out of state", phone: "555-0100-2000", email: "jane@example.com",
    },
  });
  await prisma.contactTouch.create({
    data: { organizationId: org.id, sellerId: seller.id, type: "NOTE", summary: "SENSITIVE internal note — do not send" },
  });

  // ── FULL VERTICAL ────────────────────────────────────────────────────────
  const res = await runCopilot(
    {
      consumer: "acquisition",
      user: sessionUser(org),
      subjectId: seller.id,
      question: "Summarize this seller",
      history: [],
      shortcutId: "summarize-seller",
    },
    { llm: fakeLlm, signal: new AbortController().signal },
  );

  assert(res.sources.some((s) => s.key === "seller"), "sources include the seller anchor");
  assert(res.sources.some((s) => s.key === "timeline"), "sources include the timeline (a touch was logged)");

  const text = await drain(res.stream);
  assert(text === "Hello from the copilot.", "stream starts and yields the provider's tokens");

  // The assembled prompt proves the REAL Brain ran end-to-end: grounded + guarded.
  assert(captured?.system?.includes("READ-ONLY"), "prompt carries the read-only guardrail");
  assert(captured?.system?.includes("[S1]"), "prompt labels context for citations");
  assert(captured?.system?.includes("Jane Seller"), "prompt is grounded in the seller's real data");
  assert(captured?.system?.includes("relocating out of state"), "prompt includes the real motivation");
  assert(captured?.messages?.at(-1)?.content === "Summarize this seller", "the user question is the last message");
  // The route hands the provider an AbortSignal so a client disconnect cancels upstream.
  assert(captured?.signal instanceof AbortSignal, "the abort signal is forwarded to the provider (upstream cancellation)");

  // PRIVACY (pilot policy enforced end-to-end): phone/email masked, internal notes excluded.
  assert(!captured.system.includes("555-0100-2000"), "raw phone is NOT in the prompt (masked)");
  assert(!captured.system.includes("jane@example.com"), "raw email is NOT in the prompt (masked)");
  assert(captured.system.includes("[redacted]"), "masked contact fields appear as [redacted]");
  assert(!captured.system.includes("SENSITIVE internal note"), "internal note content is excluded from the prompt");

  // ── ORG BOUNDARY ─────────────────────────────────────────────────────────
  const org2 = await mkOrg();
  const seller2 = await prisma.seller.create({
    data: { organizationId: org2.id, name: "Other Org Seller", outreachStatus: "NEW" },
  });
  let threw = false;
  try {
    await runCopilot(
      { consumer: "acquisition", user: sessionUser(org), subjectId: seller2.id, question: "x", history: [], shortcutId: "summarize-seller" },
      { llm: fakeLlm },
    );
  } catch (e) {
    // Match by the error's stable `name` (not `instanceof`) — under tsx this script
    // and the service resolve the class via different specifiers, so their class
    // identities differ even though it is the same error. Production shares the `@/`
    // specifier, so the route's `instanceof` check is sound.
    threw = e?.name === "CopilotNotFoundError";
  }
  assert(threw, "cross-org subjectId → CopilotNotFoundError (the route's 404 source)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) {
  for (const f of fail) console.log(`  - ${f}`);
  process.exit(1);
}
