import Link from "next/link";
import { notFound } from "next/navigation";
import type { OpportunityStage } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TransactionRowCard } from "@/components/transaction-row";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { stageLabel } from "@/lib/opportunity-options";
import { dashboardStages, isInFlightStage } from "@/lib/transaction-dashboard";
import { getTransactionDashboardRows } from "@/lib/transaction-dashboard-service";

export const dynamic = "force-dynamic";

// A read-ONLY, cross-opportunity current-state projection of in-flight transactions (Closing
// Slice 5). It derives every value at read time from existing operational records (TX-2) and
// contains NO mutating action — every row links out to the Opportunity's Closing Center (TX-3).
// Reuses CLOSING read authorization; org-scoped and fail-closed. No new persistence.

export default async function ClosingDashboardPage({
  searchParams,
}: {
  searchParams: { stage?: string; ready?: string; closed?: string };
}) {
  const user = await requireUser();
  // Fail closed: CLOSING read is required (all four roles hold it; a future role without it 404s).
  if (!can(user.role, "READ", "CLOSING")) notFound();

  const includeClosed = searchParams.closed === "1";
  const readyFilter = searchParams.ready === "ready" ? "ready" : searchParams.ready === "blocked" ? "blocked" : "all";
  // A specific in-flight stage if asked, else the whole in-flight set (+ PAID when "show closed"
  // is on). Never surfaces stages before UNDER_CONTRACT (TD-A). The reference instant is read
  // HERE (the route), never inside the pure projection (TD-D).
  const requested = searchParams.stage as OpportunityStage | undefined;
  const rows = await getTransactionDashboardRows(user.organizationId, {
    stage: requested && isInFlightStage(requested) ? requested : undefined,
    includeClosed,
    referenceMs: Date.now(),
  });

  const filtered = rows.filter((r) => {
    if (readyFilter === "all") return true;
    if (readyFilter === "ready") return r.readiness?.ready === true;
    return r.readiness ? !r.readiness.ready : true; // "blocked" — no checklist counts as not-ready
  });

  const readyCount = rows.filter((r) => r.readiness?.ready).length;
  // A stage/readiness filter narrows the set; "show closed" only widens it. When a narrowing
  // filter is active and nothing matches, say so distinctly from a genuinely empty pipeline.
  const filtersActive = !!requested || readyFilter !== "all";

  const stageChips: { key: string; label: string }[] = [
    { key: "all", label: "All in-flight" },
    ...dashboardStages(false).map((s) => ({ key: s, label: stageLabel(s) })),
  ];
  const qs = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { stage: requested, ready: readyFilter === "all" ? undefined : readyFilter, closed: includeClosed ? "1" : undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const chip = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Closing"
        title="Transaction Dashboard"
        description="Every deal in-flight past Under Contract — readiness, blockers, dates, and responsible parties. Open a deal to act."
      />

      {/* Filters (GET links — no client JS, no mutation) */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Stage</span>
          {stageChips.map((c) => {
            const active = c.key === "all" ? !requested : requested === c.key;
            return <Link key={c.key} href={qs({ stage: c.key === "all" ? undefined : c.key })} className={chip(active)}>{c.label}</Link>;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Readiness</span>
          <Link href={qs({ ready: undefined })} className={chip(readyFilter === "all")}>All</Link>
          <Link href={qs({ ready: "ready" })} className={chip(readyFilter === "ready")}>Ready</Link>
          <Link href={qs({ ready: "blocked" })} className={chip(readyFilter === "blocked")}>Not ready</Link>
          <span className="mx-1 text-slate-300">·</span>
          <Link href={qs({ closed: includeClosed ? undefined : "1" })} className={chip(includeClosed)}>
            {includeClosed ? "Hiding nothing — showing closed" : "Show closed (Paid)"}
          </Link>
        </div>
      </div>

      {filtered.length > 0 ? (
        <section className="card overflow-hidden" aria-label="In-flight transactions">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
            </h2>
            <span className="text-xs text-slate-500">{readyCount} ready to close</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <TransactionRowCard key={row.opportunityId} row={row} />
            ))}
          </div>
        </section>
      ) : (
        <div className="card">
          <EmptyState
            icon="check"
            title={filtersActive ? "No transactions match these filters" : "No in-flight transactions"}
            description={
              filtersActive
                ? "Adjust the stage or readiness filters to see more transactions."
                : "Deals move here once they reach Under Contract. Advance an opportunity to begin closing."
            }
          />
        </div>
      )}
    </div>
  );
}
