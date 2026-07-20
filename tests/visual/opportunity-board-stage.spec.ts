import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, oppPath, type Manifest } from "./_helpers";

// PB-2 regression: changing a lead's stage from the board dropdown moves the card between columns AND
// persists to the DB (guards the deterministic StageSelect submission — was a stale-value no-op).
// PB-1 regression: the board caps rendered cards per column.
// Attestation regression: a validated stage with missing truth opens the dialog — Cancel keeps the
// stage; Continue+reason moves the card, updates the DB, and writes an attestation ActivityLog.

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
let moveId = "", movePropId = ""; // for the plain ALLOW move
let attId = "", attPropId = ""; // for the attestation flow (no t12 diligence)

async function makeLead(title: string) {
  const prop = await prisma.property.create({ data: { organizationId: M.orgId, name: `${title} Asset`, assetType: "MULTIFAMILY", addressLine1: "1 Test St", city: "Atlanta", state: "GA" } });
  const opp = await prisma.opportunity.create({ data: { organizationId: M.orgId, propertyId: prop.id, title, stage: "LEAD" } });
  return { oppId: opp.id, propId: prop.id };
}

test.beforeAll(async () => {
  M = manifest();
  ({ oppId: moveId, propId: movePropId } = await makeLead("PB2 Stage Move Regression"));
  ({ oppId: attId, propId: attPropId } = await makeLead("PB2 Attestation Regression"));
});
test.afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { id: { in: [moveId, attId] } } }).catch(() => {});
  await prisma.property.deleteMany({ where: { id: { in: [movePropId, attPropId] } } }).catch(() => {});
  await prisma.$disconnect();
});

test.describe("opportunity board — stage move + attestation (ADMIN)", () => {
  test.use({ storageState: authFile("admin") });

  test("PB-2: changing the dropdown moves the card to the new column and persists to the DB", async ({ page }) => {
    await page.goto(BOARD);
    const link = `a[href="${oppPath(moveId)}"]`;
    await expect(page.locator(`[data-stage="LEAD"] ${link}`)).toBeVisible();
    await expect(page.locator(`[data-stage="SELLER_CONTACTED"] ${link}`)).toHaveCount(0);

    await page.locator("div.card").filter({ has: page.locator(link) }).locator('select[name="stage"]').selectOption("SELLER_CONTACTED");

    await expect(page.locator(`[data-stage="SELLER_CONTACTED"] ${link}`)).toBeVisible();
    await expect(page.locator(`[data-stage="LEAD"] ${link}`)).toHaveCount(0);
    await expect.poll(async () => (await prisma.opportunity.findUnique({ where: { id: moveId }, select: { stage: true } }))?.stage).toBe("SELLER_CONTACTED");
  });

  test("Attestation: missing truth opens the dialog; Cancel keeps the stage; Continue+reason moves it and logs the attestation", async ({ page }) => {
    await page.goto(BOARD);
    const link = `a[href="${oppPath(attId)}"]`;
    const card = page.locator("div.card").filter({ has: page.locator(link) });
    const dialog = page.locator('[role="dialog"]');

    // Move to T12_RECEIVED — the opp has no t12 diligence → REQUIRES_ATTESTATION → dialog opens.
    await card.locator('select[name="stage"]').selectOption("T12_RECEIVED");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/attestation/i);

    // Cancel → dialog closes, card stays in LEAD, DB unchanged.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(`[data-stage="LEAD"] ${link}`)).toBeVisible();
    await expect(page.locator(`[data-stage="T12_RECEIVED"] ${link}`)).toHaveCount(0);
    expect((await prisma.opportunity.findUnique({ where: { id: attId }, select: { stage: true } }))?.stage).toBe("LEAD");

    // Move again → enter a reason → Continue → card moves, DB updates, attestation ActivityLog written.
    await card.locator('select[name="stage"]').selectOption("T12_RECEIVED");
    await expect(dialog).toBeVisible();
    await dialog.locator("textarea").fill("Imported deal — T-12 reviewed offline");
    await dialog.getByRole("button", { name: "Continue" }).click();

    await expect(page.locator(`[data-stage="T12_RECEIVED"] ${link}`)).toBeVisible();
    await expect(page.locator(`[data-stage="LEAD"] ${link}`)).toHaveCount(0);
    await expect.poll(async () => (await prisma.opportunity.findUnique({ where: { id: attId }, select: { stage: true } }))?.stage).toBe("T12_RECEIVED");
    expect(await prisma.activityLog.count({ where: { opportunityId: attId, eventType: "opportunity.stage_attested" } })).toBe(1);
  });

  test("PB-1: the board is bounded (no runaway card count in a column)", async ({ page }) => {
    await page.goto(BOARD);
    await expect(async () => { expect(await page.locator('[data-stage="LEAD"] div.card').count()).toBeLessThanOrEqual(25); }).toPass();
  });
});
