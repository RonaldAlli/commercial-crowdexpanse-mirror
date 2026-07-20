import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, oppPath, type Manifest } from "./_helpers";

// PB-2 regression: changing a lead's stage from the board dropdown must move the card between columns
// AND persist to the DB. Guards the deterministic StageSelect submission (was: stale-value no-op).
// PB-1 regression: the board caps rendered cards per column (bounded), not one card per opportunity.

const DB_URL = (() => {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL ?? "";
})();
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const BOARD = "/opportunities?view=board";
let M: Manifest;
let oppId = "";
let propId = "";

test.beforeAll(async () => {
  M = manifest();
  const prop = await prisma.property.create({ data: { organizationId: M.orgId, name: "PB2 Regression Asset", assetType: "MULTIFAMILY", addressLine1: "1 Test St", city: "Atlanta", state: "GA" } });
  propId = prop.id;
  const opp = await prisma.opportunity.create({ data: { organizationId: M.orgId, propertyId: prop.id, title: "PB2 Stage Move Regression", stage: "LEAD" } });
  oppId = opp.id;
});
test.afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { id: oppId } }).catch(() => {});
  await prisma.property.deleteMany({ where: { id: propId } }).catch(() => {});
  await prisma.$disconnect();
});

test.describe("opportunity board — stage move (ADMIN)", () => {
  test.use({ storageState: authFile("admin") });

  test("PB-2: changing the dropdown moves the card to the new column and persists to the DB", async ({ page }) => {
    await page.goto(BOARD);
    const cardLink = `a[href="${oppPath(oppId)}"]`;

    // Before: the card is in the LEAD column, not in SELLER_CONTACTED.
    await expect(page.locator(`[data-stage="LEAD"] ${cardLink}`)).toBeVisible();
    await expect(page.locator(`[data-stage="SELLER_CONTACTED"] ${cardLink}`)).toHaveCount(0);

    // Act: change this card's stage select to Seller Contacted (an unruled ALLOW move — no attestation).
    const card = page.locator("div.card").filter({ has: page.locator(cardLink) });
    await card.locator('select[name="stage"]').selectOption("SELLER_CONTACTED");

    // After: card moved columns (old column empty of it, new column has it).
    await expect(page.locator(`[data-stage="SELLER_CONTACTED"] ${cardLink}`)).toBeVisible();
    await expect(page.locator(`[data-stage="LEAD"] ${cardLink}`)).toHaveCount(0);

    // And the DB actually changed (three-layer proof).
    await expect.poll(async () => (await prisma.opportunity.findUnique({ where: { id: oppId }, select: { stage: true } }))?.stage).toBe("SELLER_CONTACTED");
  });

  test("PB-1: the board is bounded (no runaway card count in a column)", async ({ page }) => {
    await page.goto(BOARD);
    // Each column renders at most the per-column cap (25). Sanity: the LEAD column card count is bounded.
    const leadCards = page.locator('[data-stage="LEAD"] div.card');
    await expect(async () => { expect(await leadCards.count()).toBeLessThanOrEqual(25); }).toPass();
  });
});
