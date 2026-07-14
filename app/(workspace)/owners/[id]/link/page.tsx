import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ilike, listQueryString, parseListParams, totalPages } from "@/lib/list-params";
import { prisma } from "@/lib/prisma";

import { linkPropertyAction, linkSellerAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function OwnerLinkPickerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { type?: string; q?: string; page?: string };
}) {
  const user = await requireUser();
  if (!can(user.role, "UPDATE", "OWNER")) notFound();

  const owner = await prisma.owner.findFirst({ where: { id: params.id, organizationId: user.organizationId }, select: { id: true, displayName: true } });
  if (!owner) notFound();

  const kind = searchParams.type === "property" ? "property" : "seller";
  const par = parseListParams(searchParams, { sortKeys: ["recent"], defaultSort: "recent" });
  const orgWhere = { organizationId: user.organizationId };
  const redirectTo = `/owners/${owner.id}`;

  const sellerWhere: Prisma.SellerWhereInput = { ...orgWhere };
  const propertyWhere: Prisma.PropertyWhereInput = { ...orgWhere };
  if (par.hasQuery) {
    sellerWhere.OR = [{ name: ilike(par.q) }, { company: ilike(par.q) }];
    propertyWhere.OR = [{ name: ilike(par.q) }, { addressLine1: ilike(par.q) }];
  }

  const [total, sellers, properties] = await Promise.all([
    kind === "seller" ? prisma.seller.count({ where: sellerWhere }) : prisma.property.count({ where: propertyWhere }),
    kind === "seller"
      ? prisma.seller.findMany({ where: sellerWhere, select: { id: true, name: true, company: true, owner: { select: { id: true, displayName: true } } }, orderBy: { updatedAt: "desc" }, skip: par.skip, take: par.take })
      : Promise.resolve([]),
    kind === "property"
      ? prisma.property.findMany({ where: propertyWhere, select: { id: true, name: true, addressLine1: true, city: true, state: true, owner: { select: { id: true, displayName: true } } }, orderBy: { updatedAt: "desc" }, skip: par.skip, take: par.take })
      : Promise.resolve([]),
  ]);

  const rows =
    kind === "seller"
      ? sellers.map((s) => ({ id: s.id, title: s.name, subtitle: s.company ?? "", owner: s.owner }))
      : properties.map((p) => ({ id: p.id, title: p.name, subtitle: [p.addressLine1, p.city, p.state].filter(Boolean).join(", "), owner: p.owner }));

  const pages = totalPages(total);
  const action = kind === "seller" ? linkSellerAction : linkPropertyAction;
  const recordField = kind === "seller" ? "sellerId" : "propertyId";
  const otherType = kind === "seller" ? "property" : "seller";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow={`Link to ${owner.displayName}`}
        title={`Link a ${kind}`}
        description="Attaching an already-linked record will move it to this owner."
        actions={
          <Link className="btn-ghost" href={`/owners/${owner.id}/link?type=${otherType}`}>
            Link a {otherType} instead
          </Link>
        }
      />

      <form className="flex items-center gap-2" action={`/owners/${owner.id}/link`}>
        <input type="hidden" name="type" value={kind} />
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" name="q" defaultValue={par.hasQuery ? par.q : ""} placeholder={`Search ${kind}s…`} />
        </div>
        <button className="btn-ghost" type="submit">Search</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={kind === "seller" ? "sellers" : "properties"} title={`No ${kind}s found`} description={par.hasQuery ? "Try a different search." : `No ${kind}s exist to link yet.`} />
      ) : (
        <div className="card divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{r.title}</p>
                <p className="truncate text-xs text-slate-400">
                  {r.subtitle}
                  {r.owner ? <> · currently {r.owner.id === owner.id ? "linked here" : <span className="text-amber-600">{r.owner.displayName} (will move)</span>}</> : null}
                </p>
              </div>
              {r.owner?.id === owner.id ? (
                <Badge tone="success" dot>Linked</Badge>
              ) : (
                <form action={action}>
                  <input type="hidden" name="ownerId" value={owner.id} />
                  <input type="hidden" name={recordField} value={r.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button className="btn-primary" type="submit">{r.owner ? "Move here" : "Attach"}</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {par.page} of {pages}</span>
          <div className="flex gap-2">
            {par.page > 1 ? <Link className="btn-ghost" href={`/owners/${owner.id}/link${listQueryString({ type: kind, q: par.hasQuery ? par.q : undefined, page: par.page - 1 })}`}>Previous</Link> : null}
            {par.page < pages ? <Link className="btn-ghost" href={`/owners/${owner.id}/link${listQueryString({ type: kind, q: par.hasQuery ? par.q : undefined, page: par.page + 1 })}`}>Next</Link> : null}
          </div>
        </div>
      ) : null}

      <Link className="btn-ghost" href={`/owners/${owner.id}`}>← Back to owner</Link>
    </div>
  );
}
