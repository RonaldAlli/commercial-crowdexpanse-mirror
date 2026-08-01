import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, type Manifest } from "./_helpers";

// Forecasting Backend Authority G-1 — the Lost/Dead effect on Pipeline Value. An ACTIVE open-pipeline deal
// contributes; a deal explicitly marked LOST (or DEAD) is excluded — no inference. The disclosure now states
// Lost/Dead are excluded (the earlier "not yet" limitation is gone). Isolated fixtures torn down.

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
const ACTIVE_C = "PVG1 Active";
const LOST_C = "PVG1 Lost";

async function mkOpp(campaign: string, fee: number, outcome: "ACTIVE" | "LOST" | "DEAD") {
  const prop = await prisma.property.create({ data: { organizationId: M.orgId, name: `${campaign} Asset`, assetType: "MULTIFAMILY", addressLine1: "7 G1 Rd", city: "Atlanta", state: "GA" } });
  propIds.push(prop.id);
  const opp = await prisma.opportunity.create({
    data: {
      organizationId: M.orgId, propertyId: prop.id, title: `PVG1 ${campaign}`, stage: "UNDER_CONTRACT",
      assignmentFeeUsd: fee, acquisitionChannel: "COMMERCIAL_BROKER", acquisitionCampaign: campaign,
      outcome, ...(outcome !== "ACTIVE" ? { outcomeReason: "test", outcomeAt: new Date("2026-07-21T00:00:00.000Z") } : {}),
    },
  });
  ids.push(opp.id);
  return opp;
}

test.beforeAll(async () => {
  M = manifest();
  await mkOpp(ACTIVE_C, 30000, "ACTIVE"); // contributes
  await mkOpp(LOST_C, 88888, "LOST"); // excluded (explicit Lost)
});

test.afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.property.deleteMany({ where: { id: { in: propIds } } }).catch(() => {});
  await prisma.$disconnect();
});

test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 1000 } });

test.describe("Pipeline Value — G-1 Lost/Dead exclusion (ADMIN, desktop)", () => {
  test("an ACTIVE deal contributes; a LOST deal is excluded (no inference)", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Pipeline value" });
    // ACTIVE deal contributes — its $30,000 appears (in the by-campaign breakdown and the contributing-deal row).
    await expect(section.locator("tr", { hasText: ACTIVE_C }).filter({ hasText: "$30,000" }).first()).toBeVisible();
    // LOST deal is excluded entirely (neither breakdown nor contributing-deal list) — no inference.
    await expect(section.getByText(LOST_C)).toHaveCount(0);
    await expect(section.getByText("$88,888")).toHaveCount(0); // the Lost deal's fee is not in Pipeline Value
  });

  test("the disclosure now states Lost/Dead are excluded (the 'not yet' limitation is gone)", async ({ page }) => {
    await page.goto("/revenue");
    const section = page.getByRole("region", { name: "Pipeline value" });
    // The old "not yet excluded" limitation is gone; the Population Transparency "Excluded" row now lists Lost/Dead.
    await expect(section.getByText(/does not yet exclude Lost\/Dead/i)).toHaveCount(0);
    await expect(section.getByText(/opportunities marked Lost or Dead/i)).toBeVisible();
  });
});
