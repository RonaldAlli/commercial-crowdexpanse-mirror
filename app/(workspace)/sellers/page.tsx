import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function marketLabel(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(", ") || "—";
}

export default async function SellersPage() {
  const user = await requireUser();

  const sellers = await prisma.seller.findMany({
    where: { organizationId: user.organizationId },
    include: { _count: { select: { opportunities: true, properties: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Seller records"
        title="Sellers"
        description="Owner relationships and motivation tracking across active markets."
        actions={
          <Link className="btn-primary" href="/sellers/new">
            Add seller
            <Icon name="arrowUpRight" className="h-4 w-4" />
          </Link>
        }
      />

      {sellers.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Seller</th>
                  <th className="table-head">Market</th>
                  <th className="table-head">Motivation</th>
                  <th className="table-head">Deals</th>
                  <th className="table-head">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sellers.map((seller) => (
                  <tr key={seller.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="table-cell">
                      <Link href={`/sellers/${seller.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {seller.name}
                      </Link>
                      {seller.company ? <p className="text-xs text-slate-500">{seller.company}</p> : null}
                    </td>
                    <td className="table-cell whitespace-nowrap">{marketLabel(seller.city, seller.state)}</td>
                    <td className="table-cell max-w-xs text-slate-600">{seller.motivation ?? "—"}</td>
                    <td className="table-cell">
                      <Badge tone={seller._count.opportunities > 0 ? "success" : "neutral"}>
                        {seller._count.opportunities}
                      </Badge>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      {seller.email ? (
                        <p className="flex items-center gap-1.5 text-slate-600">
                          <Icon name="mail" className="h-3.5 w-3.5 text-slate-400" />
                          {seller.email}
                        </p>
                      ) : null}
                      {seller.phone ? (
                        <p className="mt-1 flex items-center gap-1.5 text-slate-500">
                          <Icon name="phone" className="h-3.5 w-3.5 text-slate-400" />
                          {seller.phone}
                        </p>
                      ) : null}
                      {!seller.email && !seller.phone ? <span className="text-slate-400">—</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="sellers"
            title="No sellers yet"
            description="Add your first motivated seller to start building acquisition pipeline."
            action={
              <Link className="btn-primary" href="/sellers/new">
                Add seller
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
