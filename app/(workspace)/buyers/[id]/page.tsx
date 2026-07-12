import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { NotesSection } from "@/components/notes-section";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";

import { deleteBuyer } from "../actions";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  return value == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default async function BuyerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const buyer = await prisma.buyer.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: { activities: { orderBy: { createdAt: "desc" }, take: 10 } },
  });

  if (!buyer) {
    notFound();
  }

  const contact: { label: string; value: string | null }[] = [
    { label: "Company", value: buyer.company },
    { label: "Email", value: buyer.email },
    { label: "Phone", value: buyer.phone },
  ];

  const lo = usd(buyer.minimumPurchaseUsd);
  const hi = usd(buyer.maximumPurchaseUsd);
  const range = lo && hi ? `${lo} – ${hi}` : lo ? `${lo}+` : hi ? `Up to ${hi}` : "—";

  const deleteBuyerBound = deleteBuyer.bind(null, buyer.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Buyer record"
        title={buyer.name}
        description={buyer.company ?? undefined}
        actions={
          <>
            <Link className="btn-ghost" href={`/buyers/${buyer.id}/edit`}>
              <Icon name="notes" className="h-4 w-4" />
              Edit
            </Link>
            {can(user.role, "DELETE", "BUYER") ? (
              <form action={deleteBuyerBound}>
                <button type="submit" className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
                  Delete
                </button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <article className="card p-6">
            <p className="eyebrow">Contact</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              {contact.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs text-slate-500">{d.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{d.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="card p-6">
            <p className="eyebrow">Buy box</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs text-slate-500">Purchase range</p>
                <p className="metric mt-0.5 text-sm font-medium text-slate-900">{range}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Target asset types</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {buyer.targetAssetTypes.length > 0 ? (
                    buyer.targetAssetTypes.map((t) => (
                      <Badge key={t} tone="neutral">
                        {titleCase(t)}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Target states</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {buyer.targetStates.length > 0 ? buyer.targetStates.join(", ") : "—"}
                </p>
              </div>
            </div>
          </article>
        </div>

        <article className="card lg:col-span-1">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Activity</h2>
          </div>
          {buyer.activities.length > 0 ? (
            <ul className="px-5 py-2">
              {buyer.activities.map((entry, i) => (
                <li key={entry.id} className="flex gap-4 py-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                    {i < buyer.activities.length - 1 ? <span className="mt-1 w-px flex-1 bg-slate-200" /> : null}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-sm font-medium text-slate-900">{entry.eventLabel}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {entry.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="activity" title="No activity yet" />
          )}
        </article>
      </div>

      <NotesSection organizationId={user.organizationId} type="buyer" id={buyer.id} />
    </div>
  );
}
