// CRE Operating Workspace — Revenue Workspace, Milestone 1 (Realized Revenue), Increment 1.
//
// Contract:
//   guarantees — the executive "Revenue Health" answer, first: the three revenue concepts (Projected →
//     Expected → Realized) each shown with a DISTINCT visual treatment and an explicit category label, so an
//     operator can never confuse them (Financial Truthfulness contract). Realized is the authoritative headline
//     figure; Expected and Projected are honestly presented as per-deal truths that Milestone 1 does not
//     aggregate at the organization level (never fabricated org totals).
//   does NOT — compute any financial value, sum Expected/Projected, or invent a confidence model. The realized
//     total is supplied by the caller (reused from the business-intelligence authority).

type Tier = {
  key: "projected" | "expected" | "realized";
  label: string;
  meaning: string;
  value: string;
  note: string;
  tone: string; // distinct visual treatment per category
  emphasis: boolean;
};

export function RevenueHealthCard({ realizedUsd }: { realizedUsd: number }) {
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  // Projected → Expected → Realized. Only Realized has an authoritative org-level figure (BI Rule 1).
  const tiers: Tier[] = [
    {
      key: "projected",
      label: "Projected",
      meaning: "Underwriting estimate",
      value: "Measured per deal",
      note: "From Guided Underwriting — not aggregated at the organization level in Milestone 1.",
      tone: "border-slate-200 bg-slate-50 text-slate-600",
      emphasis: false,
    },
    {
      key: "expected",
      label: "Expected",
      meaning: "Contracted — expected at closing",
      value: "Measured per deal",
      note: "From the deal's assignment fee — not aggregated at the organization level in Milestone 1.",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      emphasis: false,
    },
    {
      key: "realized",
      label: "Realized",
      meaning: "Actually received — executed assignment fees (all-time)",
      value: usd(realizedUsd),
      note: "Confidence: High — counts only executed assignment settlements.",
      tone: "border-emerald-300 bg-emerald-50 text-emerald-800",
      emphasis: true,
    },
  ];

  return (
    <section aria-labelledby="revenue-health-heading" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="revenue-health-heading" className="text-base font-semibold text-slate-900">Revenue health</h2>
        <span className="text-xs text-slate-400">Projected → Expected → Realized</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.key} className={`rounded-lg border p-4 ${t.tone} ${t.emphasis ? "ring-1 ring-emerald-300" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide">{t.label}</span>
            </div>
            <p className="mt-0.5 text-xs opacity-80">{t.meaning}</p>
            <p className={`mt-2 tabular-nums ${t.emphasis ? "text-2xl font-semibold" : "text-sm font-medium"}`}>{t.value}</p>
            <p className="mt-1 text-[11px] leading-snug opacity-70">{t.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Milestone 1 answers <span className="font-medium text-slate-500">what revenue has actually been earned</span>.
        Projected and Expected are per-deal truths shown on each Opportunity — they are never summed into realized revenue.
      </p>
    </section>
  );
}
