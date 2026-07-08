import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { properties } from "@/lib/demo-data";

export default function PropertiesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property records"
        title="Properties"
        description="Asset inventory tied to sellers, underwriting, and opportunity flow."
        actions={<button className="btn-primary">Add property</button>}
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className="table-head">Property</th>
                <th className="table-head">Asset type</th>
                <th className="table-head text-right">Units / keys</th>
                <th className="table-head text-right">Occupancy</th>
                <th className="table-head text-right">Basis</th>
                <th className="table-head text-right">NOI</th>
                <th className="table-head">Seller</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {properties.map((property) => (
                <tr key={property.id} className="transition-colors hover:bg-slate-50/60">
                  <td className="table-cell">
                    <p className="font-medium text-slate-900">{property.name}</p>
                    <p className="text-xs text-slate-500">{property.market}</p>
                  </td>
                  <td className="table-cell whitespace-nowrap">
                    <Badge tone="neutral">{property.assetType}</Badge>
                  </td>
                  <td className="table-cell metric text-right text-slate-900">{property.units}</td>
                  <td className="table-cell text-right">
                    <span className="metric text-slate-900">{property.occupancy}</span>
                  </td>
                  <td className="table-cell metric text-right font-medium text-slate-900">
                    {property.basis}
                  </td>
                  <td className="table-cell metric text-right font-medium text-emerald-600">
                    {property.noi}
                  </td>
                  <td className="table-cell whitespace-nowrap text-slate-600">{property.seller}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
