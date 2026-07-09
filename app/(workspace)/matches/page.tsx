import Link from "next/link";
import { AssetType, MatchStatus, type Prisma } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchStatusLabel, matchStatusTone, MATCH_STATUS_OPTIONS } from "@/lib/match-options";
import { stageLabel } from "@/lib/opportunity-options";
import { titleCase } from "@/lib/property-options";

export const dynamic = "force-dynamic";

const STATUS_VALUES = new Set<string>(Object.values(MatchStatus));
const ASSET_VALUES = new Set<string>(Object.values(AssetType));

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: { status?: string; asset?: string };
}) {
  const user = await requireUser();

  const statusFilter = STATUS_VALUES.has(searchParams.status ?? "") ? (searchParams.status as string) : "all";
  const assetFilter = ASSET_VALUES.has(searchParams.asset ?? "") ? (searchParams.asset as string) : "all";

  const where: Prisma.BuyerMatchWhereInput = { organizationId: user.organizationId };
  if (statusFilter !== "all") where.status = statusFilter as MatchStatus;
  if (assetFilter !== "all") where.opportunity = { property: { assetType: assetFilter as AssetType } };

  const [total, matches] = await Promise.all([
    prisma.buyerMatch.count({ where }),
    prisma.buyerMatch.findMany({
      where,
      include: {
        buyer: { select: { id: true, name: true, company: true } },
        opportunity: {
          select: {
            id: true,
            title: true,
            stage: true,
            property: { select: { id: true, name: true, assetType: true, city: true, state: true } },
          },
        },
      },
      orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
  ]);

  const hasFilter = statusFilter !== "all" || assetFilter !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dispositions"
        title="Buyer Matches"
        description="Every buyer match across your pipeline, ranked by deterministic fit. Generate matches from an opportunity's detail page."
      />

      {/* Filters (server-rendered GET form — no JS required) */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Status
          <select name="status" defaultValue={statusFilter} className="input h-9 w-40 py-0 text-sm">
            <option value="all">All statuses</option>
            {MATCH_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Asset type
          <select name="asset" defaultValue={assetFilter} className="input h-9 w-48 py-0 text-sm">
            <option value="all">All asset types</option>
            {Object.values(AssetType).map((a) => (
              <option key={a} value={a}>{titleCase(a)}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">Apply</button>
        {hasFilter ? <Link href="/matches" className="btn-ghost">Clear</Link> : null}
      </form>

      {matches.length > 0 ? (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {matches.map((m) => (
              <li key={m.id} className="flex items-start gap-4 px-5 py-4">
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <span className="metric text-xl font-semibold text-slate-900">{m.score ?? "—"}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">score</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/buyers/${m.buyer.id}`} className="text-sm font-semibold text-brand-700 hover:underline">
                      {m.buyer.name}
                    </Link>
                    {m.buyer.company ? <span className="text-xs text-slate-400">{m.buyer.company}</span> : null}
                    <Badge tone={matchStatusTone(m.status)}>{matchStatusLabel(m.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    <Link href={`/opportunities/${m.opportunity.id}`} className="font-medium text-slate-700 hover:underline">
                      {m.opportunity.title}
                    </Link>
                    {" · "}
                    {m.opportunity.property.name} · {titleCase(m.opportunity.property.assetType)}
                    {[m.opportunity.property.city, m.opportunity.property.state].filter(Boolean).length
                      ? ` · ${[m.opportunity.property.city, m.opportunity.property.state].filter(Boolean).join(", ")}`
                      : ""}
                    {" · "}
                    <span className="text-slate-400">{stageLabel(m.opportunity.stage)}</span>
                  </p>
                  {m.thesis ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{m.thesis}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="spark"
            title={hasFilter ? "No matches for these filters" : "No buyer matches yet"}
            description={
              hasFilter
                ? "Try clearing the filters, or generate matches from an opportunity."
                : "Open an opportunity and run “Find matching buyers” to build your first matches."
            }
          />
        </div>
      )}

      <p className="text-xs text-slate-400">
        {total} match{total === 1 ? "" : "es"} · {user.organizationName}
      </p>
    </div>
  );
}
