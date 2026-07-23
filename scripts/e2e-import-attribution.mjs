// AC-ATTR-* (Import Approach A) — attribution on the IMPORT path. Runs the REAL importer
// (scripts/import-dealautomator-commercial-leads.ts) against the test DB with --channel/--campaign/
// --event-key and proves the imported Opportunity carries the same three attribution fields as the
// manual/promote path — and that a consumer reads them WITHOUT branching on origin (AC-ATTR-8).
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { assertTestDatabase } from "./e2e-guard.mjs";
import { prisma } from "../lib/prisma.ts";

const TAG = "e2e-import-attr";
const PROVIDER = `${TAG}-provider`;
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };

const CSV =
  "address,market,owner,asset_summary\n" +
  '"789 Marietta St Atlanta, GA 30318","Atlanta, GA","Gamma Holdings LLC","40 units multifamily"\n';

function runImporter(slug, email, summaryPath, csvPath, extra) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/import-dealautomator-commercial-leads.ts",
        "--file", csvPath, "--org", slug, "--actor-email", email,
        "--provider", PROVIDER, "--summary-file", summaryPath, ...extra],
      { cwd: process.cwd(), env: process.env },
    );
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

const orgIds = [];
const tmp = [];
try {
  const A = await prisma.organization.create({ data: { name: `${TAG}-a`, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(A.id);
  const actor = await prisma.user.create({ data: { organizationId: A.id, name: "Actor", email: `${TAG}-${process.pid}@example.test`, hashedPassword: "x", role: "ADMIN" } });

  const csvPath = path.join("/tmp", `${TAG}-${process.pid}.csv`);
  await fs.writeFile(csvPath, CSV, "utf8");
  tmp.push(csvPath);
  const s1 = path.join("/tmp", `${TAG}-${process.pid}.json`);
  tmp.push(s1);

  console.log("\n[AC-ATTR-1/import] importer stamps channel + campaign + eventKey on the imported opportunity:");
  const r1 = await runImporter(A.slug, actor.email, s1, csvPath, ["--channel", "COMMERCIAL_BROKER", "--campaign", "Deal Automator July 2026", "--event-key", "job_test_123"]);
  assert(r1.code === 0, `importer exits 0 (stderr: ${r1.stderr.slice(0, 120)})`);
  const opp = await prisma.opportunity.findFirst({ where: { organizationId: A.id } });
  assert(opp && opp.acquisitionChannel === "COMMERCIAL_BROKER" && opp.acquisitionCampaign === "Deal Automator July 2026" && opp.acquisitionEventKey === "job_test_123", "imported opportunity retains all three attribution layers");

  console.log("\n[AC-ATTR-8] origin parity — a consumer reads imported + manual opportunities IDENTICALLY:");
  // A manually-promoted opportunity in the same channel (different origin) — created the plain way.
  const prop = await prisma.property.create({ data: { organizationId: A.id, name: "Manual", assetType: "MULTIFAMILY", addressLine1: "1 Manual Way", city: "Atlanta", state: "GA" } });
  await prisma.opportunity.create({ data: { organizationId: A.id, propertyId: prop.id, title: "Manual deal", acquisitionChannel: "COMMERCIAL_BROKER", acquisitionCampaign: "Q3 broker", acquisitionEventKey: null } });
  // ONE origin-agnostic consumer query — groups purely on acquisitionChannel, no branching on how each entered.
  const byChannel = await prisma.opportunity.groupBy({ by: ["acquisitionChannel"], where: { organizationId: A.id }, _count: true });
  const broker = byChannel.find((r) => r.acquisitionChannel === "COMMERCIAL_BROKER");
  assert(broker && broker._count === 2, "both the IMPORTED and the MANUAL opportunity count under COMMERCIAL_BROKER (consumer never branches on origin)");

  console.log("\n[defensive] importer without --channel still runs; opportunity attribution = null (UNKNOWN):");
  const B = await prisma.organization.create({ data: { name: `${TAG}-b`, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(B.id);
  const actorB = await prisma.user.create({ data: { organizationId: B.id, name: "Actor B", email: `${TAG}-${process.pid}-b@example.test`, hashedPassword: "x", role: "ADMIN" } });
  const s2 = path.join("/tmp", `${TAG}-${process.pid}-b.json`);
  tmp.push(s2);
  const r2 = await runImporter(B.slug, actorB.email, s2, csvPath, []);
  assert(r2.code === 0, "importer without --channel still exits 0 (channel is required at the queue layer, not here)");
  const oppB = await prisma.opportunity.findFirst({ where: { organizationId: B.id } });
  assert(oppB && oppB.acquisitionChannel === null, "no-channel import → null attribution (UNKNOWN), never throws");
} finally {
  console.log("\nCleaning up throwaway orgs + temp files (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  for (const f of tmp) await fs.rm(f, { force: true }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
