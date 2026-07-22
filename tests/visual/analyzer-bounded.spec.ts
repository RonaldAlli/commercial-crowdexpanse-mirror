import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, type Manifest } from "./_helpers";

// Deal Analyzer regression: the entry page (/analyzer) MUST stay bounded when an org has more than
// ANALYZER_LIMIT (60) opportunities. Before the fix it rendered EVERY opportunity (~9.6k at prod scale →
// a ~9.5 MB page that hung). This seeds >60 and asserts the page renders at most the cap + the
// "View all in Opportunities" affordance + the truncation note.

const ANALYZER_LIMIT = 60;
const SEED = 65; // > ANALYZER_LIMIT so the bound + "View all" must appear

const DB_URL = (() => {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL ?? "";
})();
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

let M: Manifest;
let propId = "";
let oppIds: string[] = [];

test.beforeAll(async () => {
  M = manifest();
  const prop = await prisma.property.create({
    data: { organizationId: M.orgId, name: "Analyzer Bound Asset", assetType: "MULTIFAMILY", addressLine1: "1 Test St", city: "Atlanta", state: "GA" },
  });
  propId = prop.id;
  const created = await prisma.$transaction(
    Array.from({ length: SEED }, (_, i) =>
      prisma.opportunity.create({ data: { organizationId: M.orgId, propertyId: propId, title: `Analyzer Bound ${i + 1}` }, select: { id: true } })),
  );
  oppIds = created.map((o) => o.id);
});

test.afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { id: { in: oppIds } } }).catch(() => {});
  await prisma.property.deleteMany({ where: { id: propId } }).catch(() => {});
  await prisma.$disconnect();
});

test.describe("deal analyzer — bounded entry list (ADMIN)", () => {
  test.use({ storageState: authFile("admin") });

  test("renders at most ANALYZER_LIMIT opportunity rows + a 'View all' affordance when there are more", async ({ page }) => {
    await page.goto("/analyzer");
    await expect(page.getByRole("heading", { name: "Deal Analyzer" })).toBeVisible();

    // Opportunity rows link to /analyzer/<id> (analyzed) or /analyzer/<id>/edit (needs analysis). Exclude
    // the header's ATM wholesale action. The count must be capped — NOT the full seeded set.
    const oppLinks = page.locator('a[href^="/analyzer/"]:not([href="/analyzer/atm-wholesale"])');
    const count = await oppLinks.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(ANALYZER_LIMIT);

    // Truncation affordance: total (> cap) is surfaced + the full set stays reachable.
    await expect(page.getByRole("link", { name: "View all in Opportunities" })).toBeVisible();
    await expect(page.getByText(/most recently updated of/)).toBeVisible();
  });
});
