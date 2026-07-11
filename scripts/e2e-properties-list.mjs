// Focused E2E for Better Lists — properties slice.
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Drives the REAL lib/list-params (parseListParams, ilike, totalPages) plus the
// same property where/orderBy/skip/take the /properties page builds. Proves:
// param parsing (defaults, sort whitelist, min-query, page clamp), search field
// coverage (name/addressLine1/city/state) + case-insensitivity, org scoping,
// pagination slicing, and sort.
//
// Note: Property has required non-null fields (name, assetType, addressLine1,
// city, state), unlike Seller/Buyer — the factory supplies valid defaults and
// each search-coverage row varies only the field under test.
import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { parseListParams, ilike, totalPages, LIST_PAGE_SIZE } from "../lib/list-params.ts";

const TAG = "e2e-properties";
let ok = 0;
assertTestDatabase(); // abort unless DATABASE_URL targets a *_test database
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

const SORT_KEYS = ["newest", "name", "updated"];
const SORT_ORDER = { newest: { createdAt: "desc" }, name: { name: "asc" }, updated: { updatedAt: "desc" } };

// Mirror of the /properties page query, built from the real parsed params.
async function queryProperties(orgId, raw) {
  const params = parseListParams(raw, { sortKeys: SORT_KEYS, defaultSort: "newest" });
  const where = { organizationId: orgId };
  if (params.hasQuery) {
    where.OR = [
      { name: ilike(params.q) }, { addressLine1: ilike(params.q) },
      { city: ilike(params.q) }, { state: ilike(params.q) },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.property.count({ where }),
    prisma.property.findMany({ where, orderBy: SORT_ORDER[params.sort], skip: params.skip, take: params.take }),
  ]);
  return { params, total, rows };
}

// Required non-null fields default to non-matching constants; callers override
// only the field they want to exercise.
const mkProperty = (orgId, data) =>
  prisma.property.create({
    data: {
      organizationId: orgId,
      name: "Placeholder Asset",
      assetType: "MULTIFAMILY",
      addressLine1: "1 Placeholder Way",
      city: "Nowhere",
      state: "ZZ",
      ...data,
    },
  });

const orgIds = [];
try {
  console.log("[1] parseListParams — pure rules:");
  const d = parseListParams({}, { sortKeys: SORT_KEYS, defaultSort: "newest" });
  assert(d.q === "" && !d.hasQuery && d.sort === "newest" && d.page === 1 && d.skip === 0 && d.take === LIST_PAGE_SIZE, "defaults: empty q, newest, page 1, skip 0");
  assert(parseListParams({ sort: "garbage" }, { sortKeys: SORT_KEYS, defaultSort: "newest" }).sort === "newest", "unknown sort falls back to default");
  assert(parseListParams({ sort: "name" }, { sortKeys: SORT_KEYS, defaultSort: "newest" }).sort === "name", "whitelisted sort accepted");
  assert(parseListParams({ q: "a" }, { sortKeys: SORT_KEYS, defaultSort: "newest" }).hasQuery === false, "1-char query is below min (no filter)");
  assert(parseListParams({ q: "ab" }, { sortKeys: SORT_KEYS, defaultSort: "newest" }).hasQuery === true, "2-char query filters");
  const p3 = parseListParams({ page: "3" }, { sortKeys: SORT_KEYS, defaultSort: "newest" });
  assert(p3.page === 3 && p3.skip === 2 * LIST_PAGE_SIZE, "page 3 → skip 2*pageSize");
  assert(parseListParams({ page: "0" }, { sortKeys: SORT_KEYS, defaultSort: "newest" }).page === 1, "page 0 clamps to 1");
  assert(totalPages(0) === 1 && totalPages(LIST_PAGE_SIZE + 1) === 2, "totalPages: 0→1, size+1→2");

  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[2] Search — field coverage + case-insensitive:");
  await mkProperty(a.id, { name: "Beacon Ridge Apartments" });   // name
  await mkProperty(a.id, { addressLine1: "742 Beacon Boulevard" }); // addressLine1
  await mkProperty(a.id, { city: "Beacon Falls" });                // city
  await mkProperty(a.id, { state: "Beaconshire" });                // state
  await mkProperty(a.id, { name: "Unrelated Tower" });
  const rSearch = await queryProperties(a.id, { q: "beacon" });
  assert(rSearch.total === 4, "search matches name/addressLine1/city/state (4 hits)");
  assert((await queryProperties(a.id, { q: "BEACON" })).total === 4, "search is case-insensitive");
  assert((await queryProperties(a.id, { q: "nonesuch" })).total === 0, "non-matching term → 0");

  console.log("\n[3] Org scoping:");
  await mkProperty(b.id, { name: "Beacon Rival Plaza" }); // same token, other org
  const rScoped = await queryProperties(a.id, { q: "beacon" });
  assert(rScoped.total === 4, "org B's matching property is not counted for org A");
  assert(rScoped.rows.every((p) => p.organizationId === a.id), "every row belongs to org A");

  console.log("\n[4] Pagination:");
  for (let i = 0; i < 25; i++) await mkProperty(a.id, { name: `Pageblock Property ${String(i).padStart(2, "0")}` });
  const pg1 = await queryProperties(a.id, { q: "pageblock", page: "1" });
  const pg2 = await queryProperties(a.id, { q: "pageblock", page: "2" });
  assert(pg1.total === 25, "count reflects all 25 matches");
  assert(pg1.rows.length === LIST_PAGE_SIZE, "page 1 returns a full page of 20");
  assert(pg2.rows.length === 5, "page 2 returns the remaining 5");
  const overlap = pg1.rows.some((r) => pg2.rows.find((x) => x.id === r.id));
  assert(!overlap, "pages don't overlap");

  console.log("\n[5] Sort (whitelist → orderBy):");
  await mkProperty(a.id, { name: "Alpha sortcheck Estate" });  // created first → older
  await mkProperty(a.id, { name: "Zeta sortcheck Estate" });   // created second → newer
  const byNewest = await queryProperties(a.id, { q: "sortcheck", sort: "newest" });
  const byName = await queryProperties(a.id, { q: "sortcheck", sort: "name" });
  assert(byNewest.rows[0].name === "Zeta sortcheck Estate", "newest sort → most recent first");
  assert(byName.rows[0].name === "Alpha sortcheck Estate", "name sort → alphabetical first");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
