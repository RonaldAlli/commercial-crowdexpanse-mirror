// Focused E2E for Better Lists — tasks slice (Option A: faithful in-memory order).
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Drives the REAL lib/list-params + lib/task-sort (the SAME comparator the page
// uses) plus the same task where/base-order/slice path the /tasks page builds.
// Proves: param parsing (defaults → "workflow", sort whitelist, min-query, page
// clamp), search coverage (title/description) + case-insensitivity, org scoping,
// pagination slicing, and every sort mode (workflow priority, due, newest, title).
import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { parseListParams, ilike, totalPages, LIST_PAGE_SIZE } from "../lib/list-params.ts";
import { sortTasks, TASK_SORT_KEYS } from "../lib/task-sort.ts";

const TAG = "e2e-tasks";
let ok = 0;
assertTestDatabase(); // abort unless DATABASE_URL targets a *_test database
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

// Mirror of the /tasks page query: fetch filtered rows in a stable base order,
// sort in memory with the shared comparator, then slice for the page.
async function queryTasks(orgId, raw) {
  const params = parseListParams(raw, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" });
  const where = { organizationId: orgId };
  if (params.hasQuery) {
    where.OR = [{ title: ilike(params.q) }, { description: ilike(params.q) }];
  }
  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({ where, orderBy: { id: "asc" } }),
  ]);
  const sorted = sortTasks(rows, params.sort);
  return { params, total, rows: sorted.slice(params.skip, params.skip + params.take) };
}

const mkTask = (orgId, data) => prisma.task.create({ data: { organizationId: orgId, title: "Placeholder Task", ...data } });

const orgIds = [];
try {
  console.log("[1] parseListParams — pure rules:");
  const d = parseListParams({}, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" });
  assert(d.q === "" && !d.hasQuery && d.sort === "workflow" && d.page === 1 && d.skip === 0 && d.take === LIST_PAGE_SIZE, "defaults: empty q, workflow, page 1, skip 0");
  assert(parseListParams({ sort: "garbage" }, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" }).sort === "workflow", "unknown sort falls back to default");
  assert(parseListParams({ sort: "due" }, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" }).sort === "due", "whitelisted sort accepted");
  assert(parseListParams({ q: "a" }, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" }).hasQuery === false, "1-char query is below min (no filter)");
  assert(parseListParams({ q: "ab" }, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" }).hasQuery === true, "2-char query filters");
  const p3 = parseListParams({ page: "3" }, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" });
  assert(p3.page === 3 && p3.skip === 2 * LIST_PAGE_SIZE, "page 3 → skip 2*pageSize");
  assert(parseListParams({ page: "0" }, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" }).page === 1, "page 0 clamps to 1");
  assert(totalPages(0) === 1 && totalPages(LIST_PAGE_SIZE + 1) === 2, "totalPages: 0→1, size+1→2");

  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[2] Search — field coverage + case-insensitive:");
  await mkTask(a.id, { title: "Deposit escrow wire" });                         // title token below
  await mkTask(a.id, { title: "Renamed", description: "confirm escrow release" }); // description
  await mkTask(a.id, { title: "Unrelated chore" });
  const rSearch = await queryTasks(a.id, { q: "escrow" });
  assert(rSearch.total === 2, "search matches title/description (2 hits)");
  assert((await queryTasks(a.id, { q: "ESCROW" })).total === 2, "search is case-insensitive");
  assert((await queryTasks(a.id, { q: "nonesuch" })).total === 0, "non-matching term → 0");

  console.log("\n[3] Org scoping:");
  await mkTask(b.id, { title: "escrow task for other org" }); // same token, other org
  const rScoped = await queryTasks(a.id, { q: "escrow" });
  assert(rScoped.total === 2, "org B's matching task is not counted for org A");
  assert(rScoped.rows.every((t) => t.organizationId === a.id), "every row belongs to org A");

  console.log("\n[4] Pagination:");
  for (let i = 0; i < 25; i++) await mkTask(a.id, { title: `Pageblock Task ${String(i).padStart(2, "0")}` });
  const pg1 = await queryTasks(a.id, { q: "pageblock", page: "1" });
  const pg2 = await queryTasks(a.id, { q: "pageblock", page: "2" });
  assert(pg1.total === 25, "count reflects all 25 matches");
  assert(pg1.rows.length === LIST_PAGE_SIZE, "page 1 returns a full page of 20");
  assert(pg2.rows.length === 5, "page 2 returns the remaining 5");
  const overlap = pg1.rows.some((r) => pg2.rows.find((x) => x.id === r.id));
  assert(!overlap, "pages don't overlap");

  console.log("\n[5] Sort — workflow priority (BLOCKED → IN_PROGRESS → BACKLOG → COMPLETE):");
  await mkTask(a.id, { title: "wfstatus complete", status: "COMPLETE" });
  await mkTask(a.id, { title: "wfstatus backlog", status: "BACKLOG" });
  await mkTask(a.id, { title: "wfstatus blocked", status: "BLOCKED" });
  await mkTask(a.id, { title: "wfstatus in progress", status: "IN_PROGRESS" });
  const wf = await queryTasks(a.id, { q: "wfstatus" });
  assert(JSON.stringify(wf.rows.map((t) => t.status)) === JSON.stringify(["BLOCKED", "IN_PROGRESS", "BACKLOG", "COMPLETE"]), "workflow sort orders by status priority");

  console.log("\n[6] Sort — due date (asc, nulls last):");
  await mkTask(a.id, { title: "wfdue later", dueDate: new Date("2026-06-01") });
  await mkTask(a.id, { title: "wfdue undated" }); // no due date → last
  await mkTask(a.id, { title: "wfdue earlier", dueDate: new Date("2026-02-01") });
  const due = await queryTasks(a.id, { q: "wfdue", sort: "due" });
  assert(JSON.stringify(due.rows.map((t) => t.title)) === JSON.stringify(["wfdue earlier", "wfdue later", "wfdue undated"]), "due sort → earliest first, undated last");

  console.log("\n[7] Sort — title & newest:");
  await mkTask(a.id, { title: "Zeta wforder Task" }); // created first → older
  await mkTask(a.id, { title: "Alpha wforder Task" }); // created second → newer
  const byTitle = await queryTasks(a.id, { q: "wforder", sort: "title" });
  const byNewest = await queryTasks(a.id, { q: "wforder", sort: "newest" });
  assert(byTitle.rows[0].title === "Alpha wforder Task", "title sort → alphabetical first");
  assert(byNewest.rows[0].title === "Alpha wforder Task", "newest sort → most recently created first");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
