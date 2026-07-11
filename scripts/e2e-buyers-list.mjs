// Focused E2E for Better Lists — buyers slice.
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Drives the REAL lib/list-params (parseListParams, ilike, totalPages) plus the
// same buyer where/orderBy/skip/take the /buyers page builds. Proves: param
// parsing (defaults, sort whitelist, min-query, page clamp), search field
// coverage (name/company/email) + case-insensitivity, org scoping, pagination
// slicing, and sort.
import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { parseListParams, ilike, totalPages, LIST_PAGE_SIZE } from "../lib/list-params.ts";

const TAG = "e2e-buyers";
let ok = 0;
assertTestDatabase(); // abort unless DATABASE_URL targets a *_test database
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

const SORT_KEYS = ["newest", "name", "updated"];
const SORT_ORDER = { newest: { createdAt: "desc" }, name: { name: "asc" }, updated: { updatedAt: "desc" } };

// Mirror of the /buyers page query, built from the real parsed params.
async function queryBuyers(orgId, raw) {
  const params = parseListParams(raw, { sortKeys: SORT_KEYS, defaultSort: "newest" });
  const where = { organizationId: orgId };
  if (params.hasQuery) {
    where.OR = [{ name: ilike(params.q) }, { company: ilike(params.q) }, { email: ilike(params.q) }];
  }
  const [total, rows] = await Promise.all([
    prisma.buyer.count({ where }),
    prisma.buyer.findMany({ where, orderBy: SORT_ORDER[params.sort], skip: params.skip, take: params.take }),
  ]);
  return { params, total, rows };
}

const mkBuyer = (orgId, data) => prisma.buyer.create({ data: { organizationId: orgId, ...data } });

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
  await mkBuyer(a.id, { name: "Cascade Capital" });                          // name
  await mkBuyer(a.id, { name: "Nguyen Ventures", company: "Cascade Holdings" }); // company
  await mkBuyer(a.id, { name: "Contact One", email: "deals@cascade.test" });     // email
  await mkBuyer(a.id, { name: "Unrelated Buyer" });
  const rSearch = await queryBuyers(a.id, { q: "cascade" });
  assert(rSearch.total === 3, "search matches name/company/email (3 hits)");
  assert((await queryBuyers(a.id, { q: "CASCADE" })).total === 3, "search is case-insensitive");
  assert((await queryBuyers(a.id, { q: "nonesuch" })).total === 0, "non-matching term → 0");

  console.log("\n[3] Org scoping:");
  await mkBuyer(b.id, { name: "Cascade Rival" }); // same token, other org
  const rScoped = await queryBuyers(a.id, { q: "cascade" });
  assert(rScoped.total === 3, "org B's matching buyer is not counted for org A");
  assert(rScoped.rows.every((s) => s.organizationId === a.id), "every row belongs to org A");

  console.log("\n[4] Pagination:");
  for (let i = 0; i < 25; i++) await mkBuyer(a.id, { name: `Pageblock Buyer ${String(i).padStart(2, "0")}` });
  const pg1 = await queryBuyers(a.id, { q: "pageblock", page: "1" });
  const pg2 = await queryBuyers(a.id, { q: "pageblock", page: "2" });
  assert(pg1.total === 25, "count reflects all 25 matches");
  assert(pg1.rows.length === LIST_PAGE_SIZE, "page 1 returns a full page of 20");
  assert(pg2.rows.length === 5, "page 2 returns the remaining 5");
  const overlap = pg1.rows.some((r) => pg2.rows.find((x) => x.id === r.id));
  assert(!overlap, "pages don't overlap");

  console.log("\n[5] Sort (whitelist → orderBy):");
  await mkBuyer(a.id, { name: "Alpha sortcheck Co" });   // created first → older
  await mkBuyer(a.id, { name: "Zeta sortcheck Co" });    // created second → newer
  const byNewest = await queryBuyers(a.id, { q: "sortcheck", sort: "newest" });
  const byName = await queryBuyers(a.id, { q: "sortcheck", sort: "name" });
  assert(byNewest.rows[0].name === "Zeta sortcheck Co", "newest sort → most recent first");
  assert(byName.rows[0].name === "Alpha sortcheck Co", "name sort → alphabetical first");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
