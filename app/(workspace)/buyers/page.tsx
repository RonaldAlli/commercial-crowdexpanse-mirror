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
  if (value == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function rangeLabel(min: number | null, max: number | null) {
  const lo = usd(min);
  const hi = usd(max);
  if (lo && hi) return `${lo} – ${hi}`;
  if (lo) return `${lo}+`;
  if (hi) return `Up to ${hi}`;
  return "—";
}

export default async function BuyersPage() {
  const user = await requireUser();

  const buyers = await prisma.buyer.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Buyer records"
        title="Buyers"
        description="Capital partners by asset appetite, target market, and purchase range."
        actions={
          <Link className="btn-primary" href="/buyers/new">
            Add buyer
            <Icon name="arrowUpRight" className="h-4 w-4" />
          </Link>
        }
      />

      {buyers.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {buyers.map((buyer) => (
            <Link
              key={buyer.id}
              href={`/buyers/${buyer.id}`}
              className="card p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{buyer.name}</p>
                  {buyer.company ? <p className="truncate text-xs text-slate-500">{buyer.company}</p> : null}
                </div>
                <Badge tone="brand">{rangeLabel(buyer.minimumPurchaseUsd, buyer.maximumPurchaseUsd)}</Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {buyer.targetAssetTypes.length > 0 ? (
                  buyer.targetAssetTypes.map((t) => (
                    <Badge key={t} tone="neutral">
                      {titleCase(t)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">No target asset types</span>
                )}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                {buyer.targetStates.length > 0 ? `Markets: ${buyer.targetStates.join(", ")}` : "No target markets"}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="buyers"
            title="No buyers yet"
            description="Add capital partners to match against your acquisition pipeline."
            action={
              <Link className="btn-primary" href="/buyers/new">
                Add buyer
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
