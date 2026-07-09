// Focused E2E for global search (Global Search slice).
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Drives the REAL searchAll() from lib/search — the same code the /search page
// calls. Proves: matches across all four primary records, case-insensitivity,
// field coverage (title/source/address/county/email), org scoping, the
// per-group cap, and the min-length / no-match empty paths.
import { prisma } from "../lib/prisma.ts";
import { searchAll, SEARCH_GROUP_CAP } from "../lib/search.ts";

const TAG = "e2e-search";
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
const group = (res, key) => res.groups.find((g) => g.key === key);

async function seedOrg(slug, prefix) {
  const org = await prisma.organization.create({ data: { name: TAG, slug } });
  const property = await prisma.property.create({
    data: {
      organizationId: org.id, name: `${prefix} Tower`, assetType: "OFFICE",
      addressLine1: `100 ${prefix} Street`, city: "Austin", state: "TX", county: "Travis",
    },
  });
  const opportunity = await prisma.opportunity.create({
    data: { organizationId: org.id, propertyId: property.id, title: `${prefix} Tower Acquisition`, source: `${prefix} broker` },
  });
  const seller = await prisma.seller.create({
    data: { organizationId: org.id, name: `${prefix} Holdings LLC`, company: `${prefix} Capital`, email: `sales@${prefix.toLowerCase()}.test`, city: "Austin", state: "TX" },
  });
  const buyer = await prisma.buyer.create({
    data: { organizationId: org.id, name: `${prefix} Investors`, company: `${prefix} Group`, email: `buy@${prefix.toLowerCase()}.test` },
  });
  return { org, property, opportunity, seller, buyer };
}

const orgIds = [];
try {
  // Org A and org B both contain the token "Zephyr" — org B is the scoping control.
  const a = await seedOrg(`${TAG}-${process.pid}-a`, "Zephyr");
  orgIds.push(a.org.id);
  const b = await seedOrg(`${TAG}-${process.pid}-b`, "Zephyr");
  orgIds.push(b.org.id);

  console.log("\n[1] Matches across all four records (org A):");
  const r1 = await searchAll(a.org.id, "zephyr");
  assert(group(r1, "opportunities").hits.length === 1, "1 opportunity hit");
  assert(group(r1, "properties").hits.length === 1, "1 property hit");
  assert(group(r1, "sellers").hits.length === 1, "1 seller hit");
  assert(group(r1, "buyers").hits.length === 1, "1 buyer hit");
  assert(r1.total === 4, "total = 4");
  assert(group(r1, "opportunities").hits[0].href === `/opportunities/${a.opportunity.id}`, "opportunity hit links to detail page");

  console.log("\n[2] Case-insensitive:");
  const r2 = await searchAll(a.org.id, "ZEPHYR");
  assert(r2.total === 4, "uppercase query returns the same 4 hits");

  console.log("\n[3] Org scoping — org A never returns org B rows:");
  const aIds = new Set([a.opportunity.id, a.property.id, a.seller.id, a.buyer.id]);
  const bIds = new Set([b.opportunity.id, b.property.id, b.seller.id, b.buyer.id]);
  const allHitIds = r1.groups.flatMap((g) => g.hits.map((h) => h.id));
  assert(allHitIds.every((id) => aIds.has(id)), "every hit belongs to org A");
  assert(!allHitIds.some((id) => bIds.has(id)), "no org B row leaked into org A results");

  console.log("\n[4] Field coverage (non-name fields):");
  assert((await searchAll(a.org.id, "travis")).groups.find((g) => g.key === "properties").hits.length === 1, "property matched by county");
  assert((await searchAll(a.org.id, "100 zephyr street")).groups.find((g) => g.key === "properties").hits.length === 1, "property matched by address");
  const rSource = await searchAll(a.org.id, "broker");
  assert(group(rSource, "opportunities").hits.length === 1, "opportunity matched by source");
  const rEmail = await searchAll(a.org.id, "sales@zephyr.test");
  assert(group(rEmail, "sellers").hits.length === 1, "seller matched by email");

  console.log("\n[5] Per-group cap:");
  for (let i = 0; i < SEARCH_GROUP_CAP + 1; i++) {
    await prisma.seller.create({ data: { organizationId: a.org.id, name: `Capbatch Seller ${i}` } });
  }
  const rCap = await searchAll(a.org.id, "capbatch");
  assert(group(rCap, "sellers").hits.length === SEARCH_GROUP_CAP, `sellers capped at ${SEARCH_GROUP_CAP}`);
  assert(group(rCap, "sellers").capped === true, "capped flag set when more matches exist");

  console.log("\n[6] Min-length and no-match:");
  const rShort = await searchAll(a.org.id, "z");
  assert(rShort.tooShort === true && rShort.total === 0, "single char is too short (no query run)");
  const rNone = await searchAll(a.org.id, "nonexistentxyztoken");
  assert(rNone.tooShort === false && rNone.total === 0, "non-matching term returns zero hits");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
