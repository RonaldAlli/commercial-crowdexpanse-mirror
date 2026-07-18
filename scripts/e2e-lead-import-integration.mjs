// Wave 6 — Lead-import integration test. Runs the REAL importer
// (scripts/import-dealautomator-commercial-leads.ts) against the test DB to prove the ACCEPTED
// behavior (no new policy): (1) idempotency — a second identical run creates 0 new records
// (domain-level find-first-or-create dedup); (2) provenance — external-id + note + activity written,
// org-scoped; (3) cross-org actor fails closed; (4) org-scoping of all created records.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { assertTestDatabase } from "./e2e-guard.mjs";
import { prisma } from "../lib/prisma.ts";

const TAG = "e2e-lead-import";
const PROVIDER = `${TAG}-provider`;
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }

const CSV =
  'address,market,owner,asset_summary\n' +
  '"456 Peachtree St Atlanta, GA 30303","Atlanta, GA","Beta Holdings LLC","20 units multifamily"\n';

function runImporter(slug, email, summaryPath, csvPath) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/import-dealautomator-commercial-leads.ts",
        "--file", csvPath, "--org", slug, "--actor-email", email,
        "--provider", PROVIDER, "--summary-file", summaryPath],
      { cwd: process.cwd(), env: process.env },
    );
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}
const readSummary = async (p) => JSON.parse(await fs.readFile(p, "utf8"));

const orgIds = [];
const tmp = [];
try {
  const A = await prisma.organization.create({ data: { name: `${TAG}-a`, slug: `${TAG}-${process.pid}-a` } });
  const B = await prisma.organization.create({ data: { name: `${TAG}-b`, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(A.id, B.id);
  const actorA = await prisma.user.create({ data: { organizationId: A.id, name: "Actor A", email: `${TAG}-${process.pid}-a@example.test`, hashedPassword: "x", role: "ADMIN" } });
  const actorB = await prisma.user.create({ data: { organizationId: B.id, name: "Actor B", email: `${TAG}-${process.pid}-b@example.test`, hashedPassword: "x", role: "ADMIN" } });
  void actorA;

  const csvPath = path.join("/tmp", `${TAG}-${process.pid}.csv`);
  await fs.writeFile(csvPath, CSV, "utf8");
  tmp.push(csvPath);
  const s1 = path.join("/tmp", `${TAG}-${process.pid}-run1.json`);
  const s2 = path.join("/tmp", `${TAG}-${process.pid}-run2.json`);
  const sx = path.join("/tmp", `${TAG}-${process.pid}-runx.json`);
  tmp.push(s1, s2, sx);

  console.log("\n[1] First import run — creates records:");
  const r1 = await runImporter(A.slug, actorA.email, s1, csvPath);
  assert(r1.code === 0, "first run exits 0");
  const sum1 = await readSummary(s1);
  assert(sum1.opportunitiesCreated >= 1 && sum1.ownersCreated >= 1 && sum1.notesCreated >= 1, "run 1 created owner + opportunity + note");
  assert(sum1.externalIdsAttached >= 1, "run 1 attached a provenance external identifier");

  console.log("\n[2] Idempotency — re-running the SAME file creates 0 new (domain-level dedup):");
  const r2 = await runImporter(A.slug, actorA.email, s2, csvPath);
  assert(r2.code === 0, "second run exits 0");
  const sum2 = await readSummary(s2);
  assert(sum2.opportunitiesCreated === 0 && sum2.notesCreated === 0 && sum2.ownersCreated === 0, "run 2 created NOTHING new (converged)");
  assert(sum2.opportunitiesReused >= 1 && (sum2.ownersReused >= 1 || sum2.propertiesResolved >= 1), "run 2 reused/resolved existing records");

  console.log("\n[3] Provenance + org-scoping of created records:");
  const [extId, notes, acts, oppsA, oppsB] = await Promise.all([
    prisma.propertyExternalIdentifier.findFirst({ where: { organizationId: A.id, provider: PROVIDER } }),
    prisma.note.count({ where: { organizationId: A.id } }),
    prisma.activityLog.count({ where: { organizationId: A.id, eventType: "opportunity.created" } }),
    prisma.opportunity.count({ where: { organizationId: A.id } }),
    prisma.opportunity.count({ where: { organizationId: B.id } }),
  ]);
  assert(extId !== null, "provenance external identifier is org-scoped to A");
  assert(notes >= 1 && acts >= 1, "note + opportunity.created activity written (org A)");
  assert(oppsA >= 1 && oppsB === 0, "created opportunity belongs to A only (org-scoped; B has none)");

  console.log("\n[4] Cross-org actor fails closed:");
  const rx = await runImporter(A.slug, actorB.email, sx, csvPath); // actor B, org A → must reject
  assert(rx.code !== 0, "importing org A as actor B exits nonzero (fail closed)");
  assert(/does not belong to organization/i.test(rx.stderr), "rejection cites actor↔org membership");
  assert((await prisma.opportunity.count({ where: { organizationId: B.id } })) === 0, "no records leaked into B from the rejected run");
} finally {
  console.log("\nCleaning up throwaway orgs + temp files (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  for (const f of tmp) await fs.rm(f, { force: true }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
