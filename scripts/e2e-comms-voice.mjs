// Branch 2 — voice config e2e. Proves the token endpoint's data path: CommsProviderConfig → resolveVoiceStatus,
// org-scoped, and that the status resolution never touches the raw secret (only booleans). Real Telnyx
// connection is credential-gated and out of scope here. Runs against the *_test DB (throwaway, cleaned).
import { randomUUID } from "node:crypto";
import crypto from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { resolveVoiceStatus } from "../lib/comms/voice-provider.ts";
import { encryptSecret } from "../lib/comms/secret-box.ts";

const TAG = "e2e-comms-voice";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const orgIds = [];
const KEY = crypto.randomBytes(32).toString("hex");
const mkOrg = async () => { const o = await prisma.organization.create({ data: { name: `${TAG} ${process.pid}`, slug: `${TAG}-${process.pid}-${randomUUID().slice(0, 8)}` } }); orgIds.push(o.id); return o; };

// Mirror the endpoint's read + resolve.
async function voiceStatusFor(orgId) {
  const cfg = await prisma.commsProviderConfig.findUnique({ where: { organizationId: orgId }, select: { voiceEnabled: true, apiKeyEnc: true, connectionId: true } });
  return resolveVoiceStatus(cfg ? { voiceEnabled: cfg.voiceEnabled, hasApiKey: Boolean(cfg.apiKeyEnc), hasConnectionId: Boolean(cfg.connectionId) } : null);
}

try {
  const noConfig = await mkOrg();
  assert((await voiceStatusFor(noConfig.id)).configured === false, "org with no provider config → not configured");

  const disabled = await mkOrg();
  await prisma.commsProviderConfig.create({ data: { organizationId: disabled.id, voiceEnabled: false, apiKeyEnc: encryptSecret("KEY_x", KEY), connectionId: "conn_1" } });
  assert((await voiceStatusFor(disabled.id)).configured === false, "voice disabled → not configured (even with credentials present)");

  const partial = await mkOrg();
  await prisma.commsProviderConfig.create({ data: { organizationId: partial.id, voiceEnabled: true, apiKeyEnc: encryptSecret("KEY_y", KEY), connectionId: null } });
  assert((await voiceStatusFor(partial.id)).configured === false, "enabled but missing connection id → not configured");

  const ready = await mkOrg();
  await prisma.commsProviderConfig.create({ data: { organizationId: ready.id, voiceEnabled: true, apiKeyEnc: encryptSecret("KEY_z", KEY), connectionId: "conn_2" } });
  const s = await voiceStatusFor(ready.id);
  assert(s.configured === true && s.reason === null, "enabled + api key + connection id → configured");

  console.log("\n[no-leak] status resolution consumes only booleans — the raw secret never enters the status path:");
  const cfg = await prisma.commsProviderConfig.findUnique({ where: { organizationId: ready.id } });
  assert(cfg.apiKeyEnc !== "KEY_z" && !JSON.stringify(s).includes("KEY_z") && s.token === undefined, "voice status never contains the API key or a token");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
