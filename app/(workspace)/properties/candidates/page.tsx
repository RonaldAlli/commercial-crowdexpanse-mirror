import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can, canReopenMatchDecision } from "@/lib/permissions";
import { listQueryString, parseListParams, totalPages } from "@/lib/list-params";
import { generatePropertyCandidateQueue, listPropertyDecisions } from "@/lib/property-match";
import { prisma } from "@/lib/prisma";

import { confirmPropertyCandidateAction as confirmForm, dismissPropertyCandidateAction as dismissForm, reopenPropertyCandidateAction as reopenForm } from "./actions";

export const dynamic = "force-dynamic";

// Explanatory labels for the deterministic resolution basis (why the engine raised
// this candidate). Presentation only — never affects behavior (Human Review P4).
const BASIS_LABEL: Record<string, string> = {
  PARCEL_CONFLICT: "Conflicting parcel / identifier evidence",
  ADDRESS_PROPOSAL: "Same address, same jurisdiction",
  EXTERNAL_ID_CONFLICT: "Conflicting external identifiers",
  UNIQUE_PARCEL: "Unique parcel match",
  UNIQUE_EXTERNAL_IDENTIFIER: "Unique external identifier",
};
type View = "pending" | "dismissed" | "confirmed";
type PropertyLite = { id: string; name: string; city: string; state: string };
// The common shape the queue and the decision list both satisfy (presentation only).
type CandidateRow = { id?: string; propertyIdA: string; propertyIdB: string; basis: string };

function PropertyChip({ property, fallbackId }: { property: PropertyLite | undefined; fallbackId: string }) {
  if (!property) return <span className="text-sm text-slate-400">(property {fallbackId.slice(0, 6)}… unavailable)</span>;
  return (
    <Link href={`/properties/${property.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700">
      {property.name} <span className="text-xs font-normal text-slate-400">· {[property.city, property.state].filter(Boolean).join(", ")}</span>
    </Link>
  );
}

export default async function PropertyCandidatesPage({ searchParams }: { searchParams: { view?: string; page?: string } }) {
  const user = await requireUser();
  // Identity review is governance, not operational reporting → ADMIN/ACQUISITIONS only.
  if (!can(user.role, "READ", "PROPERTY_IDENTITY")) notFound();

  const view: View = searchParams.view === "dismissed" ? "dismissed" : searchParams.view === "confirmed" ? "confirmed" : "pending";
  const par = parseListParams(searchParams, { sortKeys: ["recent"], defaultSort: "recent" });
  const canDecide = can(user.role, "MANAGE", "PROPERTY_IDENTITY");
  const canReopen = canReopenMatchDecision(user.role);

  const pending = view === "pending" ? await generatePropertyCandidateQueue(user.organizationId, { skip: par.skip, take: par.take }) : null;
  const decisions = view !== "pending" ? await listPropertyDecisions(user.organizationId, view === "dismissed" ? "DISMISSED" : "CONFIRMED", { skip: par.skip, take: par.take }) : null;

  const rows: CandidateRow[] = pending?.pending ?? decisions?.decisions ?? [];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.propertyIdA, r.propertyIdB])));
  const properties = await prisma.property.findMany({ where: { organizationId: user.organizationId, id: { in: ids } }, select: { id: true, name: true, city: true, state: true } });
  const byId = new Map(properties.map((p) => [p.id, p]));

  const total = pending?.total ?? decisions?.total ?? 0;
  const pages = totalPages(total);

  const tab = (v: View, label: string) => (
    <Link href={`/properties/candidates${listQueryString({ view: v })}`} className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-brand-50 font-medium text-brand-700" : "text-slate-500 hover:bg-slate-50"}`}>
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial intelligence"
        title="Property identity review"
        description="Human decision support — confirm or dismiss possible identity matches the resolution engine surfaced. Confirming records a decision; it does not merge (structural merge is deferred). The engine decides; you govern."
      />

      <div className="flex items-center gap-1">
        {tab("pending", "Pending")}
        {tab("dismissed", "Dismissed")}
        {tab("confirmed", "Confirmed")}
      </div>

      {view === "confirmed" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          Confirmed pairs record a human judgement that these are the same asset. <span className="font-medium">Structural Property merge is deferred</span> — a confirmed pair is the input to a future merge, not a merge itself.
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="card divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.id ?? `${r.propertyIdA}|${r.propertyIdB}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <PropertyChip property={byId.get(r.propertyIdA)} fallbackId={r.propertyIdA} />
                  <span className="text-slate-300">↔</span>
                  <PropertyChip property={byId.get(r.propertyIdB)} fallbackId={r.propertyIdB} />
                </div>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                  {view === "dismissed" ? <Badge tone="neutral">Dismissed</Badge> : view === "confirmed" ? <Badge tone="success">Confirmed</Badge> : null}
                  <span>{BASIS_LABEL[r.basis] ?? r.basis}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {view === "pending" && canDecide ? (
                  <>
                    <form action={confirmForm}>
                      <input type="hidden" name="propertyIdA" value={r.propertyIdA} />
                      <input type="hidden" name="propertyIdB" value={r.propertyIdB} />
                      <button type="submit" className="btn-primary">Confirm</button>
                    </form>
                    <form action={dismissForm}>
                      <input type="hidden" name="propertyIdA" value={r.propertyIdA} />
                      <input type="hidden" name="propertyIdB" value={r.propertyIdB} />
                      <button type="submit" className="btn-ghost">Dismiss</button>
                    </form>
                  </>
                ) : view !== "pending" && canReopen ? (
                  <form action={reopenForm}>
                    <input type="hidden" name="propertyIdA" value={r.propertyIdA} />
                    <input type="hidden" name="propertyIdB" value={r.propertyIdB} />
                    <button type="submit" className="btn-ghost">Reopen</button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="properties"
          title={view === "pending" ? "No pending candidates" : view === "confirmed" ? "No confirmed pairs" : "No dismissed pairs"}
          description={view === "dismissed" ? "Dismissed pairs stay hidden until a material identity change or an admin reopens them." : "Nothing to review right now."}
        />
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {par.page} of {pages}</span>
          <div className="flex gap-2">
            {par.page > 1 ? <Link className="btn-ghost" href={`/properties/candidates${listQueryString({ view, page: par.page - 1 })}`}>Previous</Link> : null}
            {par.page < pages ? <Link className="btn-ghost" href={`/properties/candidates${listQueryString({ view, page: par.page + 1 })}`}>Next</Link> : null}
          </div>
        </div>
      ) : null}

      <Link className="btn-ghost" href="/properties">← Back to properties</Link>
    </div>
  );
}
