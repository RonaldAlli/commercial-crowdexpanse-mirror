import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function percent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

export default async function PropertiesPage() {
  const user = await requireUser();

  const properties = await prisma.property.findMany({
    where: { organizationId: user.organizationId },
    include: { seller: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property records"
        title="Properties"
        description="Asset inventory tied to sellers, underwriting, and opportunity flow."
        actions={
          <Link className="btn-primary" href="/properties/new">
            Add property
            <Icon name="arrowUpRight" className="h-4 w-4" />
          </Link>
        }
      />

      {properties.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Property</th>
                  <th className="table-head">Asset type</th>
                  <th className="table-head text-right">Units</th>
                  <th className="table-head text-right">Occupancy</th>
                  <th className="table-head text-right">Asking</th>
                  <th className="table-head text-right">NOI</th>
                  <th className="table-head">Seller</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {properties.map((property) => (
                  <tr key={property.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="table-cell">
                      <Link href={`/properties/${property.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {property.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {[property.city, property.state].filter(Boolean).join(", ") || "—"}
                      </p>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      <Badge tone="neutral">{titleCase(property.assetType)}</Badge>
                    </td>
                    <td className="table-cell metric text-right text-slate-900">{property.unitCount ?? "—"}</td>
                    <td className="table-cell metric text-right text-slate-900">{percent(property.occupancyRate)}</td>
                    <td className="table-cell metric text-right font-medium text-slate-900">{usd(property.askingPriceUsd)}</td>
                    <td className="table-cell metric text-right font-medium text-emerald-600">{usd(property.noiAnnualUsd)}</td>
                    <td className="table-cell whitespace-nowrap text-slate-600">{property.seller?.name ?? "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="properties"
            title="No properties yet"
            description="Add your first commercial asset to start underwriting and matching."
            action={
              <Link className="btn-primary" href="/properties/new">
                Add property
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
