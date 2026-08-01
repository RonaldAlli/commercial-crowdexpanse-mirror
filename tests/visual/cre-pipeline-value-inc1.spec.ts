import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — Pipeline Value, Increment 1 (org-level summary on /revenue).
// Pipeline Value = OPERATIONAL INVENTORY: unweighted sum of Opportunity.assignmentFeeUsd over the open-pipeline
// population (stage UNDER_CONTRACT/BUYER_MATCHED/CLOSING, excluding executed=realized). Never a forecast; kept
// separate from Realized. Seeds two included open-pipeline deals + one excluded (executed assignment) and tears
// them down.

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
const INCLUDED = "PVINC1-INCLUDED";
const EXCLUDED = "PVINC1-EXCLUDED";

async function mkOpp(stage: string, fee: number, campaign: string) {
  const prop = await prisma.property.create({ data: { organizationId: M.orgId, name: `${campaign} ${stage} Asset`, assetType: "MULTIFAMILY", addressLine1: "5 Pipeline Rd", city: "Atlanta", state: "GA" } });
  propIds.push(prop.id);
  const opp = await prisma.opportunity.create({
    data: { organizationId: M.orgId, propertyId: prop.id, title: `PV ${stage} ${fee}`, stage: stage as never, assignmentFeeUsd: fee, acquisitionChannel: "COMMERCIAL_BROKER", acquisitionCampaign: campaign },
  });
  ids.push(opp.id);
  return opp;
}

test.beforeAll(async () => {
  M = manifest();
  await mkOpp("UNDER_CONTRACT", 20000, INCLUDED); // included
  await mkOpp("CLOSING", 15000, INCLUDED); // included → INCLUDED campaign totals $35,000
  const excluded = await mkOpp("CLOSING", 99999, EXCLUDED); // has an EXECUTED assignment → realized → excluded
  await prisma.assignmentRecord.create({ data: { organizationId: M.orgId, opportunityId: excluded.id, status: "EXECUTED", executedFeeUsdSnapshot: 99999, resolvedAt: new Date("2026-07-20T00:00:00.000Z") } });
});

test.afterAll(async () => {
  await prisma.assignmentRecord.deleteMany({ where: { opportunityId: { in: ids } } }).catch(() => {});
  await prisma.opportunity.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.property.deleteMany({ where: { id: { in: propIds } } }).catch(() => {});
  await prisma.$disconnect();
});

test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 1000 } });

test.describe("Pipeline Value — Increment 1 org summary (ADMIN, desktop)", () => {
  test("the Pipeline Value section is present, labeled Operational Inventory, with the honest Lost/Dead disclosure", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Pipeline value" });
    await expect(section).toBeVisible();
    await expect(section.getByText("Operational inventory").first()).toBeVisible();
    await expect(section.getByText(/not a forecast/i)).toBeVisible();
    await expect(section.getByText(/does not yet exclude Lost\/Dead/i)).toBeVisible();
    for (const b of ["By stage", "By channel", "By campaign"]) {
      await expect(section.getByText(b, { exact: true })).toBeVisible();
    }
  });

  test("Inventory Integrity + exclusion: included deals total $35,000; the executed (realized) deal is excluded", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Pipeline value" });
    // The two included open-pipeline deals under one campaign total $35,000 (20,000 + 15,000).
    const includedRow = section.locator("tr", { hasText: INCLUDED });
    await expect(includedRow).toContainText("$35,000");
    // The executed (realized) deal's campaign must NOT appear — it is excluded from Pipeline Value.
    await expect(section.getByText(EXCLUDED)).toHaveCount(0);
  });
});
