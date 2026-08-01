// CRE Operating Workspace — Revenue Workspace, Milestone 1, Increment 3 (per-deal Revenue).
//
// Presentational. Renders the three revenue concepts as distinct, labeled tiers (Financial Truthfulness — never
// combined) and the evidence-based Revenue Timeline (occurred steps carry a real recorded date; pending steps are
// honest, never fabricated — Active Evidence). Revenue Traceability: Realized links to the assignment evidence,
// Projected to underwriting. Computes nothing — every value comes from buildOpportunityRevenueView.

import Link from "next/link";

import type { OpportunityRevenueView } from "@/lib/workspace-ui/opportunity-revenue";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function day(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

const TIER_TONE: Record<string, string> = {
  projected: "border-slate-200 bg-slate-50 text-slate-600",
  expected: "border-amber-200 bg-amber-50 text-amber-800",
  realized: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export function OpportunityRevenueSection({ view }: { view: OpportunityRevenueView }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Projected → Expected → Realized. Each is a different kind of financial truth and is never combined.</p>

      <div className="grid gap-3 sm:grid-cols-3">
        {view.tiers.map((t) => (
          <div key={t.kind} className={`rounded-lg border p-3 ${TIER_TONE[t.kind]} ${t.kind === "realized" && t.realized ? "ring-1 ring-emerald-300" : ""}`}>
            <div className="text-xs font-semibold uppercase tracking-wide">{t.label}</div>
            <div className="mt-0.5 text-[11px] opacity-80">{t.meaning}</div>
            {t.kind === "expected" ? (
              <div className="mt-2 text-lg font-semibold tabular-nums">{t.valueUsd == null ? "—" : usd(t.valueUsd)}</div>
            ) : t.kind === "realized" ? (
              <div className="mt-2 text-lg font-semibold tabular-nums">{t.realized ? usd(t.valueUsd ?? 0) : "Not yet realized"}</div>
            ) : (
              <div className="mt-2 text-sm font-medium">{t.available ? "Estimate" : "Not started"}</div>
            )}
            {/* Detail line only where it adds beyond the value (avoid duplicating "Not started"/"Not yet realized"). */}
            {t.kind === "projected" ? (
              t.href ? <Link href={t.href} className="mt-1 inline-block text-[11px] font-medium underline hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{t.detail} →</Link> : null
            ) : t.kind === "realized" ? (
              t.realized ? (
                <div className="mt-1 text-[11px]">
                  <span className="opacity-70">Executed {day(t.executedAt)} · </span>
                  <Link href={t.href} className="font-medium underline hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{t.detail} →</Link>
                </div>
              ) : null
            ) : (
              <div className="mt-1 text-[11px] opacity-70">{t.detail}</div>
            )}
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue timeline</h3>
        <ol className="mt-2 space-y-1.5">
          {view.timeline.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className={`inline-flex h-2 w-2 shrink-0 rounded-full ${s.occurred ? "bg-emerald-500" : "bg-slate-300"}`} />
              <span className={s.occurred ? "text-slate-700" : "text-slate-400"}>{s.label}</span>
              <span className="text-xs tabular-nums text-slate-400">
                {s.occurred ? (s.kind === "reference" ? "· estimate on record" : `· ${day(s.occurredAt)}`) : "· pending"}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-slate-400">Timeline reflects recorded activity only — pending steps have no recorded event.</p>
      </div>

      {/* Increment 4 — Revenue is an intentional branch of the Opportunity Workspace: from this deal's revenue,
          the operator moves out to the organization-level Revenue Workspace (Opportunity → Revenue → Revenue
          Workspace). Not a competing top-level entry; discovered through the workflow. */}
      <Link
        href="/revenue"
        className="inline-block text-xs font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Open Revenue Workspace →
      </Link>
    </div>
  );
}
