import Link from "next/link";

import { AtmWholesaleCalculator, type AtmWholesaleCalculatorLoadRecord } from "@/components/atm-wholesale-calculator";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AtmWholesaleCalculatorPage() {
  const user = await requireUser();

  const [opportunities, properties] = await Promise.all([
    prisma.opportunity.findMany({
      where: { organizationId: user.organizationId },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            addressLine1: true,
            city: true,
            state: true,
            unitCount: true,
            squareFeet: true,
            yearBuilt: true,
            occupancyRate: true,
            askingPriceUsd: true,
            estimatedValueUsd: true,
            noiAnnualUsd: true,
            capRate: true,
          },
        },
        seller: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.property.findMany({
      where: { organizationId: user.organizationId },
      include: {
        seller: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const opportunityRecords: AtmWholesaleCalculatorLoadRecord[] = opportunities.map((opportunity) => ({
    id: opportunity.id,
    source: "opportunity",
    sourceLabel: `${opportunity.title} - ${opportunity.property.name}${opportunity.seller?.name ? ` - ${opportunity.seller.name}` : ""}`,
    propertyName: opportunity.property.name,
    propertyAddress: [opportunity.property.addressLine1, opportunity.property.city, opportunity.property.state].filter(Boolean).join(", "),
    marketLabel: [opportunity.property.city, opportunity.property.state].filter(Boolean).join(", "),
    sellerName: opportunity.seller?.name ?? null,
    unitCount: opportunity.property.unitCount,
    squareFeet: opportunity.property.squareFeet,
    yearBuilt: opportunity.property.yearBuilt,
    occupancyRatePct: opportunity.property.occupancyRate,
    sellerAskingPriceUsd: opportunity.property.askingPriceUsd,
    estimatedValueUsd: opportunity.property.estimatedValueUsd,
    areaCapRatePct: opportunity.property.capRate,
    annualNetOperatingIncomeUsd: opportunity.property.noiAnnualUsd,
  }));

  const propertyRecords: AtmWholesaleCalculatorLoadRecord[] = properties.map((property) => ({
    id: property.id,
    source: "property",
    sourceLabel: `${property.name}${property.seller?.name ? ` - ${property.seller.name}` : ""} - ${property.city}, ${property.state}`,
    propertyName: property.name,
    propertyAddress: [property.addressLine1, property.city, property.state].filter(Boolean).join(", "),
    marketLabel: [property.city, property.state].filter(Boolean).join(", "),
    sellerName: property.seller?.name ?? null,
    unitCount: property.unitCount,
    squareFeet: property.squareFeet,
    yearBuilt: property.yearBuilt,
    occupancyRatePct: property.occupancyRate,
    sellerAskingPriceUsd: property.askingPriceUsd,
    estimatedValueUsd: property.estimatedValueUsd,
    areaCapRatePct: property.capRate,
    annualNetOperatingIncomeUsd: property.noiAnnualUsd,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Advisory · deal prep"
        title="ATM Wholesale Calculator"
        description="Workbook-parity NOI, valuation, financing, cash-flow, and MAO calculator built from the ATM wholesale spreadsheet formulas."
        actions={
          <Link className="btn-ghost" href="/analyzer">
            Back to analyzer
          </Link>
        }
      />
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">Advisory &amp; preliminary — not an approved Underwriting result.</span>{" "}
        This calculator is a non-authoritative deal-prep tool. Its numbers are not saved and never
        become Underwriting truth. For the authoritative, deterministic underwriting workflow
        (scenarios, decision, offer memo), use the{" "}
        <Link className="font-medium underline" href="/analyzer">
          Deal Analyzer
        </Link>
        .
      </div>
      <AtmWholesaleCalculator opportunityRecords={opportunityRecords} propertyRecords={propertyRecords} />
    </div>
  );
}
