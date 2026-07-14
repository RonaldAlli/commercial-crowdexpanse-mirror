import Link from "next/link";
import { notFound } from "next/navigation";
import type { OwnerMergeReason } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { canMergeOwners } from "@/lib/permissions";
import { listDecisions } from "@/lib/owner-match";
import { listActiveMergeRecords } from "@/lib/owner-merge";

import { unmergeAction } from "./actions";

export const dynamic = "force-dynamic";

const MERGE_REASON_LABEL: Record<OwnerMergeReason, string> = {
  MANUAL_DUPLICATE: "Manual duplicate",
  DUPLICATE_IMPORT: "Duplicate import",
  PROVIDER_RECONCILIATION: "Provider reconciliation",
  ALIAS_CONSOLIDATION: "Alias consolidation",
  OTHER: "Other",
};
const titleCase = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

function OwnerChip({ owner, fallbackId }: { owner: { id: string; displayName: string; entityType: string } | null; fallbackId: string }) {
  if (!owner) return <span className="text-sm text-slate-400">(owner {fallbackId.slice(0, 6)}… unavailable)</span>;
  return (
    <Link href={`/owners/${owner.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700">
      {owner.displayName} <span className="text-xs font-normal text-slate-400">· {titleCase(owner.entityType)}</span>
    </Link>
  );
}

export default async function OwnerMergesPage() {
  const user = await requireUser();
  // Structural merge is ADMIN-only — the whole workspace is restricted (candidate
  // review + the read-only awaiting-merge view remain available to ACQUISITIONS).
  if (!canMergeOwners(user.role)) notFound();

  const TAKE = 50;
  const queue = await listDecisions(user.organizationId, "CONFIRMED", { take: TAKE });
  const history = await listActiveMergeRecords(user.organizationId, { take: TAKE });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Commercial intelligence"
        title="Owner merges"
        description="Structural identity changes — ADMIN only. Merge confirmed duplicate owners into one canonical record, or reverse a merge. Merge is the only workflow that changes identity; confirming in candidate review does not merge."
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Awaiting merge <span className="ml-1 text-xs font-normal text-slate-400">{queue.total}</span></h2>
          <Link className="text-xs text-slate-500 hover:text-brand-700" href="/owners/candidates?view=confirmed">Candidate review →</Link>
        </div>
        {queue.decisions.length > 0 ? (
          <div className="card divide-y divide-slate-100">
            {queue.decisions.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <OwnerChip owner={d.a} fallbackId={d.ownerIdA} />
                    <span className="text-slate-300">↔</span>
                    <OwnerChip owner={d.b} fallbackId={d.ownerIdB} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400"><Badge tone="success">Confirmed duplicate</Badge></p>
                </div>
                <Link href={`/owners/merges/${d.id}`} className="btn-primary shrink-0">Merge…</Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="buyers" title="Nothing awaiting merge" description="Confirm duplicate owners in candidate review to queue them here." />
        )}
        {queue.total > TAKE ? <p className="text-xs text-slate-400">Showing the first {TAKE} of {queue.total}. Resolve some to see the rest.</p> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Merge history <span className="ml-1 text-xs font-normal text-slate-400">{history.total} active</span></h2>
        {history.records.length > 0 ? (
          <div className="card divide-y divide-slate-100">
            {history.records.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <OwnerChip owner={r.winner} fallbackId={r.id} />
                    <span className="text-xs text-slate-400">kept · absorbed</span>
                    <OwnerChip owner={r.loser} fallbackId={r.id} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{MERGE_REASON_LABEL[r.reason]}</p>
                </div>
                {r.canUnmerge ? (
                  <form action={unmergeAction} className="shrink-0">
                    <input type="hidden" name="mergeRecordId" value={r.id} />
                    <button type="submit" className="btn-ghost">Unmerge</button>
                  </form>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400" title="The surviving owner was itself merged later — reverse that merge first (LIFO).">Unmerge later merges first</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="buyers" title="No merges yet" description="Merges you perform appear here and can be reversed (most recent first)." />
        )}
        {history.total > TAKE ? <p className="text-xs text-slate-400">Showing the {TAKE} most recent of {history.total} active merges.</p> : null}
      </section>

      <Link className="btn-ghost" href="/owners">← Back to owners</Link>
    </div>
  );
}
