import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { sellers } from "@/lib/demo-data";

export default function SellersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Seller records"
        title="Sellers"
        description="Owner relationships and motivation tracking across active markets."
        actions={<button className="btn-primary">Add seller</button>}
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className="table-head">Seller</th>
                <th className="table-head">Market</th>
                <th className="table-head">Motivation</th>
                <th className="table-head">Warm deals</th>
                <th className="table-head">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sellers.map((seller) => (
                <tr key={seller.id} className="transition-colors hover:bg-slate-50/60">
                  <td className="table-cell">
                    <p className="font-medium text-slate-900">{seller.name}</p>
                    <p className="text-xs text-slate-500">{seller.company}</p>
                  </td>
                  <td className="table-cell whitespace-nowrap">{seller.market}</td>
                  <td className="table-cell max-w-xs text-slate-600">{seller.motivation}</td>
                  <td className="table-cell">
                    <Badge tone={seller.warmDeals > 1 ? "success" : "neutral"}>
                      {seller.warmDeals}
                    </Badge>
                  </td>
                  <td className="table-cell whitespace-nowrap">
                    <p className="flex items-center gap-1.5 text-slate-600">
                      <Icon name="mail" className="h-3.5 w-3.5 text-slate-400" />
                      {seller.email}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-slate-500">
                      <Icon name="phone" className="h-3.5 w-3.5 text-slate-400" />
                      {seller.phone}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
