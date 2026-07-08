import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { analyzerSnapshot } from "@/lib/demo-data";

const underwritingChecklist = [
  "T12 normalized for one-time payroll and maintenance spikes",
  "Rent roll reconciled to bank statements and occupancy claims",
  "Tax reassessment stress-tested under post-close valuation",
  "Insurance and utility assumptions pressure-tested against market comps",
];

const inputs = [
  { label: "Purchase price", value: analyzerSnapshot.purchasePrice },
  { label: "Renovation budget", value: analyzerSnapshot.renovationBudget },
  { label: "Closing costs", value: analyzerSnapshot.closingCosts },
  { label: "Gross income", value: analyzerSnapshot.grossIncome },
  { label: "Operating expenses", value: analyzerSnapshot.operatingExpenses },
  { label: "Price / unit", value: analyzerSnapshot.pricePerUnit },
];

const returns = [
  { label: "NOI", value: analyzerSnapshot.noi, tone: "text-slate-900" },
  { label: "Cap rate", value: analyzerSnapshot.capRate, tone: "text-emerald-600" },
  { label: "Debt yield", value: analyzerSnapshot.debtYield, tone: "text-emerald-600" },
  { label: "DSCR", value: analyzerSnapshot.dscr, tone: "text-emerald-600" },
];

export default function AnalyzerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial deal analyzer"
        title="Deal analyzer"
        description={analyzerSnapshot.dealName}
        actions={<button className="btn-ghost">Duplicate scenario</button>}
      />

      {/* Headline returns */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {returns.map((r) => (
          <div key={r.label} className="card p-5">
            <p className="eyebrow">{r.label}</p>
            <p className={`metric mt-3 text-3xl font-semibold ${r.tone}`}>{r.value}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <article className="card lg:col-span-3">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="eyebrow">Underwriting inputs</p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">Deal basis</h2>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
            {inputs.map((m) => (
              <div key={m.label} className="bg-white px-5 py-4">
                <p className="text-xs text-slate-500">{m.label}</p>
                <p className="metric mt-1 text-lg font-semibold text-slate-900">{m.value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="card lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="eyebrow">Analyst readout</p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">Decision framing</h2>
          </div>
          <div className="space-y-5 p-5">
            <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Icon name="spark" className="h-4 w-4 text-brand-600" />
                <Badge tone="brand">Summary</Badge>
              </div>
              <p className="text-sm leading-relaxed text-slate-700">
                {analyzerSnapshot.analystSummary}
              </p>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-900">Diligence checklist</p>
              <ul className="space-y-3">
                {underwritingChecklist.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Icon name="check" className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                    <p className="text-sm leading-relaxed text-slate-600">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
