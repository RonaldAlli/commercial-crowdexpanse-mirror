import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buyers } from "@/lib/demo-data";

export default function BuyersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Buyer records"
        title="Buyers"
        description="Capital partners by asset appetite, target market, and purchase range."
        actions={<button className="btn-primary">Add buyer</button>}
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {buyers.map((buyer) => (
          <article
            key={buyer.id}
            className="card flex flex-col p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">{buyer.firm}</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                  {buyer.name}
                </h2>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {buyer.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {buyer.focus.map((focus) => (
                <Badge key={focus} tone="brand">
                  {focus}
                </Badge>
              ))}
            </div>

            <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Markets</dt>
                <dd className="text-right font-medium text-slate-700">{buyer.markets.join(", ")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Range</dt>
                <dd className="metric text-right font-medium text-slate-900">{buyer.range}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Last touch</dt>
                <dd className="text-right text-slate-700">{buyer.lastTouch}</dd>
              </div>
            </dl>

            <p className="mt-4 flex-1 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
              {buyer.conviction}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
