import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FieldProvenanceCard } from "@/components/field-provenance";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { getFieldProvenance } from "@/lib/intelligence/provenance";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import { reversePropertyResolutionAction } from "./actions";

export const dynamic = "force-dynamic";

// Explanatory labels for the deterministic resolution basis (why the engine chose a
// path). Presentation only — never affects behavior (Human Review P4).
const BASIS_LABEL: Record<string, string> = {
  UNIQUE_PARCEL: "Unique parcel match",
  UNIQUE_EXTERNAL_IDENTIFIER: "Unique external identifier",
  PARCEL_CONFLICT: "Conflicting parcel / identifier evidence",
  ADDRESS_PROPOSAL: "Same address, same jurisdiction",
  EXTERNAL_ID_CONFLICT: "Conflicting external identifiers",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", CONFIRMED: "Confirmed", DISMISSED: "Dismissed" };
const ts = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function PropertyIdentityPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  // Identity review is governance, not operational reporting → ADMIN/ACQUISITIONS only.
  if (!can(user.role, "READ", "PROPERTY_IDENTITY")) notFound();
  const org = user.organizationId;

  const property = await prisma.property.findFirst({
    where: { id: params.id, organizationId: org },
    select: { id: true, name: true, city: true, state: true, apnNormalized: true, countyFipsCode: true, addressNormalized: true },
  });
  if (!property) notFound();

  const ref = (fieldKey: string) => ({ entityType: "PROPERTY" as const, entityId: property.id, fieldKey });
  const [identity, apnProv, fipsProv, addrProv, crosswalk, resolutions, candidates] = await Promise.all([
    prisma.propertyIdentity.findUnique({ where: { propertyId: property.id } }),
    getFieldProvenance(org, ref("apnNormalized")),
    getFieldProvenance(org, ref("countyFipsCode")),
    getFieldProvenance(org, ref("addressNormalized")),
    prisma.propertyExternalIdentifier.findMany({ where: { organizationId: org, propertyId: property.id }, orderBy: { createdAt: "desc" } }),
    prisma.propertyResolution.findMany({ where: { organizationId: org, resolvedPropertyId: property.id }, orderBy: { createdAt: "desc" } }),
    prisma.propertyMatchDecision.findMany({ where: { organizationId: org, OR: [{ propertyIdA: property.id }, { propertyIdB: property.id }] }, orderBy: { createdAt: "desc" } }),
  ]);

  // A RESOLVE event is reversible unless a REVERSAL already supersedes it.
  const reversedResolveIds = new Set(resolutions.filter((r) => r.kind === "REVERSAL" && r.supersedesResolutionId).map((r) => r.supersedesResolutionId!));
  const canReverse = can(user.role, "MANAGE", "PROPERTY_IDENTITY");

  // Display names for the "other" property in each competing candidate.
  const otherIds = Array.from(new Set(candidates.map((c) => (c.propertyIdA === property.id ? c.propertyIdB : c.propertyIdA))));
  const others = await prisma.property.findMany({ where: { organizationId: org, id: { in: otherIds } }, select: { id: true, name: true, city: true, state: true } });
  const otherById = new Map(others.map((p) => [p.id, p]));

  const anchors: { label: string; value: string | null }[] = [
    { label: "County FIPS", value: identity?.countyFipsCode ?? property.countyFipsCode },
    { label: "APN (normalized)", value: identity?.apnNormalized ?? property.apnNormalized },
    { label: "Address (normalized)", value: identity?.addressNormalized ?? property.addressNormalized },
    { label: "Parcel key", value: identity?.parcelKey ?? null },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property identity & resolution"
        title={property.name}
        description="How this canonical property is identified, what evidence resolved to it, and the deterministic decisions behind it. The engine decides; this page explains."
        actions={<Link className="btn-ghost" href={`/properties/${property.id}`}>← Property</Link>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Canonical identity — Property.id is identity; anchors are evidence. */}
          <article className="card p-6">
            <p className="eyebrow">Canonical identity</p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="font-medium text-slate-500">Property.id</span> is the identity; the anchors below are <span className="font-medium text-slate-500">evidence</span> that resolve to it. The identity index is derived and rebuildable from the ledger.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Property.id</dt>
                <dd className="metric mt-0.5 text-sm font-medium text-slate-900">{property.id}</dd>
              </div>
              {anchors.map((a) => (
                <div key={a.label}>
                  <dt className="text-xs text-slate-500">{a.label}</dt>
                  <dd className="metric mt-0.5 text-sm font-medium text-slate-900">{a.value ?? "—"}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-slate-500">Identity version</dt>
                <dd className="metric mt-0.5 text-xs font-medium text-slate-500">{identity?.identityVersion ?? "—"}</dd>
              </div>
            </dl>
          </article>

          {/* Anchor evidence + provenance: Projected Value → Winning Signal → Signal History. */}
          <div className="space-y-3">
            <p className="eyebrow">Anchor evidence &amp; provenance</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldProvenanceCard fieldLabel="County FIPS" projectedValue={property.countyFipsCode ?? ""} provenance={fipsProv} canWrite={false} />
              <FieldProvenanceCard fieldLabel="APN (normalized)" projectedValue={property.apnNormalized ?? ""} provenance={apnProv} canWrite={false} />
              <FieldProvenanceCard fieldLabel="Address (normalized)" projectedValue={property.addressNormalized ?? ""} provenance={addrProv} canWrite={false} />
            </div>
          </div>

          {/* Resolution history — append-only audit of deterministic decisions + reversals. */}
          <article className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Resolution history</h2>
              <Badge tone="neutral">{resolutions.length}</Badge>
            </div>
            {resolutions.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {resolutions.map((r) => {
                  const isReversed = r.kind === "RESOLVE" && reversedResolveIds.has(r.id);
                  return (
                    <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge tone={r.kind === "REVERSAL" ? "danger" : isReversed ? "neutral" : "info"}>{r.kind === "REVERSAL" ? "Reversed" : "Resolved"}</Badge>
                          <span className="text-sm font-medium text-slate-900">{BASIS_LABEL[r.basis] ?? r.basis}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {ts(r.createdAt)}
                          {r.reason ? <span> · {r.reason}</span> : null}
                          {isReversed ? <span> · this resolution was later reversed</span> : null}
                        </p>
                      </div>
                      {r.kind === "RESOLVE" && !isReversed && canReverse ? (
                        <form action={reversePropertyResolutionAction} className="flex shrink-0 items-center gap-2">
                          <input type="hidden" name="resolutionId" value={r.id} />
                          <input type="hidden" name="propertyId" value={property.id} />
                          <input name="reason" placeholder="Reason (optional)" className="input h-8 w-40 text-xs" />
                          <button type="submit" className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">Reverse</button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon="activity" title="No resolutions yet" description="When evidence resolves to this property, each deterministic decision is recorded here." />
            )}
          </article>
        </div>

        <div className="space-y-6 lg:col-span-1">
          {/* External identifier crosswalk — append-only; a revocation supersedes, never rewrites. */}
          <article className="card p-6">
            <p className="eyebrow">External identifiers</p>
            {crosswalk.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {crosswalk.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="metric truncate text-slate-700">{x.provider}:{x.providerIdentifier}</span>
                    <Badge tone={x.state === "ACTIVE" ? "success" : "neutral"}>{x.revokedByResolutionId ? "Revoked" : x.state === "ACTIVE" ? "Active" : "Superseded"}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No external identifiers mapped.</p>
            )}
          </article>

          {/* Competing candidates — possible identity matches for human review. */}
          <article className="card p-6">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Competing candidates</p>
              <Link className="text-xs text-slate-500 hover:text-brand-700" href="/properties/candidates">Review queue →</Link>
            </div>
            {candidates.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {candidates.map((c) => {
                  const otherId = c.propertyIdA === property.id ? c.propertyIdB : c.propertyIdA;
                  const other = otherById.get(otherId);
                  return (
                    <li key={c.id} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        {other ? (
                          <Link href={`/properties/${other.id}`} className="truncate font-medium text-slate-900 hover:text-brand-700">{other.name}</Link>
                        ) : (
                          <span className="text-slate-400">(property {otherId.slice(0, 6)}…)</span>
                        )}
                        <Badge tone={c.status === "CONFIRMED" ? "success" : c.status === "DISMISSED" ? "neutral" : "info"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-slate-400">{BASIS_LABEL[c.basis] ?? c.basis}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No competing candidates.</p>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
