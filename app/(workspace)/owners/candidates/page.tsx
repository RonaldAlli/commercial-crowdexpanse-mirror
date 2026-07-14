import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can, canMergeOwners, canReopenMatchDecision } from "@/lib/permissions";
import { listQueryString, parseListParams, totalPages } from "@/lib/list-params";
import { countConfirmed, generateCandidateQueue, listDecisions } from "@/lib/owner-match";

import { confirmCandidateAction as confirmForm, dismissCandidateAction as dismissForm, reopenCandidateAction as reopenForm } from "./actions";

export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = { "exact-match-key": "Same normalized name", "alias-match": "Matches a known alias" };
function titleCase(v: string) {
  return v.charAt(0) + v.slice(1).toLowerCase();
}
type View = "pending" | "dismissed" | "confirmed";

function OwnerChip({ owner, fallbackId }: { owner: { id: string; displayName: string; entityType: string } | null; fallbackId: string }) {
  if (!owner) return <span className="text-sm text-slate-400">(owner {fallbackId.slice(0, 6)}… unavailable)</span>;
  return (
    <Link href={`/owners/${owner.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700">
      {owner.displayName} <span className="text-xs font-normal text-slate-400">· {titleCase(owner.entityType)}</span>
    </Link>
  );
}

export default async function OwnerCandidatesPage({ searchParams }: { searchParams: { view?: string; page?: string } }) {
  const user = await requireUser();
  if (!can(user.role, "READ", "OWNER_IDENTITY")) notFound(); // OWNER_IDENTITY has no read tier → ADMIN/ACQUISITIONS only

  const view: View = searchParams.view === "dismissed" ? "dismissed" : searchParams.view === "confirmed" ? "confirmed" : "pending";
  const par = parseListParams(searchParams, { sortKeys: ["recent"], defaultSort: "recent" });
  const canReopen = canReopenMatchDecision(user.role);

  const confirmedCount = await countConfirmed(user.organizationId);
  const pending = view === "pending" ? await generateCandidateQueue(user.organizationId, { skip: par.skip, take: par.take }) : null;
  const decisions = view !== "pending" ? await listDecisions(user.organizationId, view === "dismissed" ? "DISMISSED" : "CONFIRMED", { skip: par.skip, take: par.take }) : null;
  const total = pending?.total ?? decisions?.total ?? 0;
  const pages = totalPages(total);

  const tab = (v: View, label: string, count?: number) => (
    <Link href={`/owners/candidates${listQueryString({ view: v })}`} className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-brand-50 font-medium text-brand-700" : "text-slate-500 hover:bg-slate-50"}`}>
      {label}
      {typeof count === "number" ? <span className="ml-1 text-xs text-slate-400">{count}</span> : null}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Commercial intelligence" title="Duplicate owner review" description="Human decision support — confirm or dismiss possible duplicate owners. Confirming records a decision; it does not merge." />

      <div className="flex items-center gap-1">
        {tab("pending", "Pending")}
        {tab("dismissed", "Dismissed")}
        {tab("confirmed", "Awaiting merge", confirmedCount)}
      </div>

      {view === "confirmed" && canMergeOwners(user.role) ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          <span>These confirmed duplicates are ready to merge. Merging is a separate, structural step.</span>
          <Link className="btn-primary shrink-0" href="/owners/merges">Merge workspace →</Link>
        </div>
      ) : null}

      {view === "pending" ? (
        pending && pending.pending.length > 0 ? (
          <div className="card divide-y divide-slate-100">
            {pending.pending.map((p) => (
              <div key={`${p.ownerIdA}|${p.ownerIdB}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <OwnerChip owner={p.a} fallbackId={p.ownerIdA} />
                    <span className="text-slate-300">↔</span>
                    <OwnerChip owner={p.b} fallbackId={p.ownerIdB} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{REASON_LABEL[p.reason] ?? p.reason} · {Math.round(p.identityConfidence * 100)}% identity confidence</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={confirmForm}>
                    <input type="hidden" name="ownerIdA" value={p.ownerIdA} />
                    <input type="hidden" name="ownerIdB" value={p.ownerIdB} />
                    <button type="submit" className="btn-primary">Confirm</button>
                  </form>
                  <form action={dismissForm}>
                    <input type="hidden" name="ownerIdA" value={p.ownerIdA} />
                    <input type="hidden" name="ownerIdB" value={p.ownerIdB} />
                    <button type="submit" className="btn-ghost">Dismiss</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="buyers" title="No pending duplicates" description="Nothing to review right now." />
        )
      ) : decisions && decisions.decisions.length > 0 ? (
        <div className="card divide-y divide-slate-100">
          {decisions.decisions.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <OwnerChip owner={d.a} fallbackId={d.ownerIdA} />
                  <span className="text-slate-300">↔</span>
                  <OwnerChip owner={d.b} fallbackId={d.ownerIdB} />
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {view === "confirmed" ? <Badge tone="success">Awaiting merge</Badge> : <Badge tone="neutral">Dismissed</Badge>}
                  {d.reason ? <span className="ml-2">{REASON_LABEL[d.reason] ?? d.reason}</span> : null}
                </p>
              </div>
              {canReopen ? (
                <form action={reopenForm}>
                  <input type="hidden" name="ownerIdA" value={d.ownerIdA} />
                  <input type="hidden" name="ownerIdB" value={d.ownerIdB} />
                  <button type="submit" className="btn-ghost">Reopen</button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="buyers" title={view === "confirmed" ? "Nothing awaiting merge" : "No dismissed pairs"} description={view === "confirmed" ? "Confirmed duplicates will appear here for the merge step." : "Dismissed pairs stay hidden until a material identity change or an admin reopens them."} />
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {par.page} of {pages}</span>
          <div className="flex gap-2">
            {par.page > 1 ? <Link className="btn-ghost" href={`/owners/candidates${listQueryString({ view, page: par.page - 1 })}`}>Previous</Link> : null}
            {par.page < pages ? <Link className="btn-ghost" href={`/owners/candidates${listQueryString({ view, page: par.page + 1 })}`}>Next</Link> : null}
          </div>
        </div>
      ) : null}

      <Link className="btn-ghost" href="/owners">← Back to owners</Link>
    </div>
  );
}
