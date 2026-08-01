import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — Revenue Workspace, Milestone 1, Increment 2 (Revenue Deal List).
// The org-level list of realized revenue events (one row per EXECUTED assignment) on /revenue. READ-ONLY
// consumer of the business-intelligence authority (realizedRevenueEvents). Answers: which deals generated
// revenue, how much, when, through which acquisition source — each row linking to its opportunity (Revenue
// Evidence). Seeds ONE isolated executed assignment (no shared-fixture pollution) and tears it down.

const DB_URL = (() => {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL ?? "";
})();
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

let M: Manifest;
let oppId = "", propId = "", assignmentId = "";
const FEE = 27500;
const TITLE = "INC2 Realized Revenue Deal";
const CAMPAIGN = "INC2 Spring Push";

test.beforeAll(async () => {
  M = manifest();
  const prop = await prisma.property.create({ data: { organizationId: M.orgId, name: `${TITLE} Asset`, assetType: "MULTIFAMILY", addressLine1: "9 Revenue St", city: "Atlanta", state: "GA" } });
  propId = prop.id;
  const opp = await prisma.opportunity.create({
    data: { organizationId: M.orgId, propertyId: prop.id, title: TITLE, stage: "PAID", acquisitionChannel: "COMMERCIAL_BROKER", acquisitionCampaign: CAMPAIGN },
  });
  oppId = opp.id;
  const rec = await prisma.assignmentRecord.create({
    data: {
      organizationId: M.orgId,
      opportunityId: opp.id,
      status: "EXECUTED",
      executedFeeUsdSnapshot: FEE,
      resolvedAt: new Date("2026-07-20T00:00:00.000Z"),
    },
  });
  assignmentId = rec.id;
});

test.afterAll(async () => {
  await prisma.assignmentRecord.deleteMany({ where: { id: assignmentId } }).catch(() => {});
  await prisma.opportunity.deleteMany({ where: { id: oppId } }).catch(() => {});
  await prisma.property.deleteMany({ where: { id: propId } }).catch(() => {});
  await prisma.$disconnect();
});

test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 1000 } });

test.describe("Revenue Workspace — Increment 2 realized-revenue deal list (ADMIN, desktop)", () => {
  test("the deal list is present with its column headers", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Realized revenue — deals" });
    await expect(section).toBeVisible();
    for (const col of ["Deal", "Executed", "Channel", "Campaign", "Realized revenue"]) {
      await expect(section.getByText(col, { exact: true })).toBeVisible();
    }
  });

  test("an executed deal shows its realized amount, execution date, channel and campaign", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Realized revenue — deals" });
    const row = section.locator("tr", { has: page.getByRole("link", { name: TITLE }) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("$27,500"); // realized (executed fee snapshot)
    await expect(row).toContainText("2026-07-20"); // execution date (resolvedAt)
    await expect(row).toContainText(CAMPAIGN);
  });

  test("Revenue Evidence: the deal links to its Opportunity Workspace", async ({ page }) => {
    await page.goto("/revenue");
    const link = page.getByRole("region", { name: "Realized revenue — deals" }).getByRole("link", { name: TITLE });
    await expect(link).toHaveAttribute("href", `/opportunity-workspace/${oppId}`);
  });
});
