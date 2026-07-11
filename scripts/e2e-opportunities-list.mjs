// Focused E2E for Better Lists — opportunities (List view) slice.
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Drives the REAL lib/list-params (parseListParams, ilike, totalPages) plus the
// same opportunity where/orderBy/skip/take the /opportunities List view builds.
// Proves: param parsing (defaults → "updated", sort whitelist, min-query, page
// clamp), search field coverage (title/summary/source) + case-insensitivity,
// org scoping, pagination slicing, and sort.
//
// Note: Opportunity requires a non-null propertyId, and Property itself requires
// assetType/addressLine1/city/state — so each throwaway org gets one property up
// front that all of its opportunities reference.
import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { parseListParams, ilike, totalPages, LIST_PAGE_SIZE } from "../lib/list-params.ts";

const TAG = "e2e-opportunities";
let ok = 0;
assertTestDatabase(); // abort unless DATABASE_URL targets a *_test database
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

const SORT_KEYS = ["updated", "newest", "title"];
const SORT_ORDER = { updated: { updatedAt: "desc" }, newest: { createdAt: "desc" }, title: { title: "asc" } };

// Mirror of the /opportunities List-view query, built from the real parsed params.
async function queryOpportunities(orgId, raw) {
  const params = parseListParams(raw, { sortKeys: SORT_KEYS, defaultSort: "updated" });
  const where = { organizationId: orgId };
  if (params.hasQuery) {
    where.OR = [{ title: ilike(params.q) }, { summary: ilike(params.q) }, { source: ilike(params.q) }];
  }
  const [total, rows] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({ where, orderBy: SORT_ORDER[params.sort], skip: params.skip, take: params.take }),
  ]);
  return { params, total, rows };
}

const mkProperty = (orgId) =>
  prisma.property.create({
    data: { organizationId: orgId, name: "Anchor Asset", assetType: "MULTIFAMILY", addressLine1: "1 Anchor Way", city: "Nowhere", state: "ZZ" },
  });

const mkOpp = (orgId, propertyId, data) =>
  prisma.opportunity.create({ data: { organizationId: orgId, propertyId, title: "Placeholder Deal", ...data } });

const orgIds = [];
try {
  console.log("[1] parseListParams — pure rules:");
  const d = parseListParams({}, { sortKeys: SORT_KEYS, defaultSort: "updated" });
  assert(d.q === "" && !d.hasQuery && d.sort === "updated" && d.page === 1 && d.skip === 0 && d.take === LIST_PAGE_SIZE, "defaults: empty q, updated, page 1, skip 0");
  assert(parseListParams({ sort: "garbage" }, { sortKeys: SORT_KEYS, defaultSort: "updated" }).sort === "updated", "unknown sort falls back to default");
  assert(parseListParams({ sort: "title" }, { sortKeys: SORT_KEYS, defaultSort: "updated" }).sort === "title", "whitelisted sort accepted");
  assert(parseListParams({ q: "a" }, { sortKeys: SORT_KEYS, defaultSort: "updated" }).hasQuery === false, "1-char query is below min (no filter)");
  assert(parseListParams({ q: "ab" }, { sortKeys: SORT_KEYS, defaultSort: "updated" }).hasQuery === true, "2-char query filters");
  const p3 = parseListParams({ page: "3" }, { sortKeys: SORT_KEYS, defaultSort: "updated" });
  assert(p3.page === 3 && p3.skip === 2 * LIST_PAGE_SIZE, "page 3 → skip 2*pageSize");
  assert(parseListParams({ page: "0" }, { sortKeys: SORT_KEYS, defaultSort: "updated" }).page === 1, "page 0 clamps to 1");
  assert(totalPages(0) === 1 && totalPages(LIST_PAGE_SIZE + 1) === 2, "totalPages: 0→1, size+1→2");

  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const propA = await mkProperty(a.id);
  const propB = await mkProperty(b.id);

  console.log("\n[2] Search — field coverage + case-insensitive:");
  await mkOpp(a.id, propA.id, { title: "Harbor Point Assignment" });          // title
  await mkOpp(a.id, propA.id, { title: "Deal Two", summary: "Harbor frontage upside" }); // summary
  await mkOpp(a.id, propA.id, { title: "Deal Three", source: "Harbor broker list" });     // source
  await mkOpp(a.id, propA.id, { title: "Unrelated Deal" });
  const rSearch = await queryOpportunities(a.id, { q: "harbor" });
  assert(rSearch.total === 3, "search matches title/summary/source (3 hits)");
  assert((await queryOpportunities(a.id, { q: "HARBOR" })).total === 3, "search is case-insensitive");
  assert((await queryOpportunities(a.id, { q: "nonesuch" })).total === 0, "non-matching term → 0");

  console.log("\n[3] Org scoping:");
  await mkOpp(b.id, propB.id, { title: "Harbor Rival Deal" }); // same token, other org
  const rScoped = await queryOpportunities(a.id, { q: "harbor" });
  assert(rScoped.total === 3, "org B's matching opportunity is not counted for org A");
  assert(rScoped.rows.every((o) => o.organizationId === a.id), "every row belongs to org A");

  console.log("\n[4] Pagination:");
  for (let i = 0; i < 25; i++) await mkOpp(a.id, propA.id, { title: `Pageblock Deal ${String(i).padStart(2, "0")}` });
  const pg1 = await queryOpportunities(a.id, { q: "pageblock", page: "1" });
  const pg2 = await queryOpportunities(a.id, { q: "pageblock", page: "2" });
  assert(pg1.total === 25, "count reflects all 25 matches");
  assert(pg1.rows.length === LIST_PAGE_SIZE, "page 1 returns a full page of 20");
  assert(pg2.rows.length === 5, "page 2 returns the remaining 5");
  const overlap = pg1.rows.some((r) => pg2.rows.find((x) => x.id === r.id));
  assert(!overlap, "pages don't overlap");

  console.log("\n[5] Sort (whitelist → orderBy):");
  await mkOpp(a.id, propA.id, { title: "Alpha sortcheck Deal" });  // created first → older
  await mkOpp(a.id, propA.id, { title: "Zeta sortcheck Deal" });   // created second → newer
  const byNewest = await queryOpportunities(a.id, { q: "sortcheck", sort: "newest" });
  const byTitle = await queryOpportunities(a.id, { q: "sortcheck", sort: "title" });
  assert(byNewest.rows[0].title === "Zeta sortcheck Deal", "newest sort → most recent first");
  assert(byTitle.rows[0].title === "Alpha sortcheck Deal", "title sort → alphabetical first");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
