import Link from "next/link";
import { notFound } from "next/navigation";
import { OwnerMergeReason } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { canMergeOwners } from "@/lib/permissions";
import { mergeCandidateContext, type MergeCandidateContext } from "@/lib/owner-merge";

import { mergeFromDecisionAction } from "../actions";

export const dynamic = "force-dynamic";

const MERGE_REASON_LABEL: Record<OwnerMergeReason, string> = {
  MANUAL_DUPLICATE: "Manual duplicate",
  DUPLICATE_IMPORT: "Duplicate import",
  PROVIDER_RECONCILIATION: "Provider reconciliation",
  ALIAS_CONSOLIDATION: "Alias consolidation",
  OTHER: "Other",
};
const titleCase = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

function OwnerCard({ side, suggested }: { side: MergeCandidateContext["a"]; suggested: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <Link href={`/owners/${side.id}`} className="font-medium text-slate-900 hover:text-brand-700">{side.displayName}</Link>
        {suggested ? <Badge tone="success">Suggested survivor</Badge> : null}
      </div>
      <p className="mt-0.5 text-xs text-slate-400">{titleCase(side.entityType)}</p>
      <dl className="mt-3 space-y-1 text-xs text-slate-500">
        <div className="flex justify-between"><dt>Properties</dt><dd className="font-medium text-slate-700">{side.propertyCount}</dd></div>
        <div className="flex justify-between"><dt>Sellers</dt><dd className="font-medium text-slate-700">{side.sellerCount}</dd></div>
        <div className="flex justify-between border-t border-slate-100 pt-1"><dt>Total linked records</dt><dd className="font-semibold text-slate-800">{side.total}</dd></div>
      </dl>
    </div>
  );
}

export default async function OwnerMergeConfirmPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canMergeOwners(user.role)) notFound();

  let ctx: MergeCandidateContext;
  try {
    ctx = await mergeCandidateContext(user.organizationId, params.id);
  } catch {
    // Not awaiting merge (already merged/reopened/gone, or an owner no longer ACTIVE).
    notFound();
  }

  const { a, b, suggestion } = ctx;
  const suggestedWinner = suggestion.winnerId === a.id ? a : b;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Owner merges" title="Confirm merge" description="Choose which owner survives. Merge repoints the other owner's linked records onto the survivor, preserves its names as aliases, and tombstones it. Merges are reversible." />

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span className="font-medium text-slate-700">Suggested:</span> keep <span className="font-medium text-slate-900">{suggestedWinner.displayName}</span>. <span className="text-slate-500">{suggestion.reason}.</span>
        <span className="ml-1 text-xs text-slate-400">The suggestion is advisory — confirm or change it below.</span>
      </div>

      <form action={mergeFromDecisionAction} className="space-y-5">
        <input type="hidden" name="decisionId" value={ctx.decisionId} />

        <fieldset className="space-y-3">
          <legend className="text-xs font-medium text-slate-600">Which owner survives?</legend>
          {[a, b].map((side) => {
            const other = side.id === a.id ? b : a;
            const isSuggested = side.id === suggestion.winnerId;
            return (
              <label key={side.id} className="flex cursor-pointer items-start gap-3">
                <input type="radio" name="winnerId" value={side.id} defaultChecked={isSuggested} className="mt-1" required />
                <span className="flex-1">
                  <span className="text-sm font-medium text-slate-800">Keep {side.displayName}</span>
                  {isSuggested ? <span className="ml-2 text-xs text-emerald-600">suggested</span> : null}
                  <span className="block text-xs text-slate-400">Absorbs {other.displayName} ({other.total} linked record{other.total === 1 ? "" : "s"})</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <OwnerCard side={a} suggested={suggestion.winnerId === a.id} />
          <OwnerCard side={b} suggested={suggestion.winnerId === b.id} />
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Reason</span>
          <select className="input" name="reason" defaultValue="MANUAL_DUPLICATE" required>
            {Object.values(OwnerMergeReason).map((r) => (
              <option key={r} value={r}>{MERGE_REASON_LABEL[r]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Note <span className="font-normal text-slate-400">(optional)</span></span>
          <input className="input" name="note" placeholder="Context for this merge" />
        </label>

        <div className="flex items-center gap-2">
          <button type="submit" className="btn-primary">Confirm merge</button>
          <Link href="/owners/merges" className="btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
