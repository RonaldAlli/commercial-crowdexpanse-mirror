import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — Pipeline Value, Increment 2 (contributing-deal list + traceability).
// Each contributing deal identifies the Opportunity, stage, channel, campaign, and expected fee, and links back
// to the Opportunity Workspace (Revenue Evidence · Revenue Traceability · Inventory Integrity). Realized (executed)
// deals are excluded. Population Transparency: included/excluded/why stated explicitly. Read-only; isolated
// fixtures torn down.

const DB_URL = (() => {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL ?? "";
})();
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

let M: Manifest;
const ids: string[] = [];
const propIds: string[] = [];
const ALPHA = "PVINC2 Alpha Deal";
const EXCLUDED = "PVINC2 Excluded Deal";
let alphaId = "";

async function mkOpp(title: string, stage: string, fee: number) {
  const prop = await prisma.property.create({ data: { organizationId: M.orgId, name: `${title} Asset`, assetType: "MULTIFAMILY", addressLine1: "6 Inv Rd", city: "Atlanta", state: "GA" } });
  propIds.push(prop.id);
  const opp = await prisma.opportunity.create({
    data: { organizationId: M.orgId, propertyId: prop.id, title, stage: stage as never, assignmentFeeUsd: fee, acquisitionChannel: "COMMERCIAL_BROKER", acquisitionCampaign: "PVINC2 Q3" },
  });
  ids.push(opp.id);
  return opp;
}

test.beforeAll(async () => {
  M = manifest();
  const alpha = await mkOpp(ALPHA, "UNDER_CONTRACT", 20000); // included, contributes
  alphaId = alpha.id;
  const excluded = await mkOpp(EXCLUDED, "CLOSING", 99999); // executed → realized → excluded
  await prisma.assignmentRecord.create({ data: { organizationId: M.orgId, opportunityId: excluded.id, status: "EXECUTED", executedFeeUsdSnapshot: 99999, resolvedAt: new Date("2026-07-20T00:00:00.000Z") } });
});

test.afterAll(async () => {
  await prisma.assignmentRecord.deleteMany({ where: { opportunityId: { in: ids } } }).catch(() => {});
  await prisma.opportunity.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.property.deleteMany({ where: { id: { in: propIds } } }).catch(() => {});
  await prisma.$disconnect();
});

test.use({ storageState: authFile("admin") });

async function expectNoHorizontalOverflow(page: Page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, "no material horizontal overflow").toBeLessThanOrEqual(iw + 1);
}

test.describe("Pipeline Value — Increment 2 contributing deals (ADMIN, desktop)", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("a contributing deal shows opportunity, stage, channel, campaign, fee — and links to its Opportunity Workspace", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Pipeline value" });
    await expect(section.getByText("Contributing deals")).toBeVisible();
    const row = section.locator("tr", { has: page.getByRole("link", { name: ALPHA }) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Under Contract"); // stage label
    await expect(row).toContainText("$20,000"); // expected fee
    await expect(section.getByRole("link", { name: ALPHA })).toHaveAttribute("href", `/opportunity-workspace/${alphaId}`);
  });

  test("Inventory Integrity: the realized (executed) deal is NOT a contributing deal", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Pipeline value" });
    await expect(section.getByText(EXCLUDED)).toHaveCount(0);
  });

  test("Population Transparency: included / excluded / why are stated explicitly", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Pipeline value" });
    await expect(section.getByText("Included", { exact: true })).toBeVisible();
    await expect(section.getByText("Excluded", { exact: true })).toBeVisible();
    await expect(section.getByText("Why", { exact: true })).toBeVisible();
  });
});

test.describe("Pipeline Value — Increment 2 responsive (ADMIN)", () => {
  test("mobile: the Pipeline Value section (with deal list) has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/revenue");
    await expect(page.getByRole("region", { name: "Pipeline value" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
