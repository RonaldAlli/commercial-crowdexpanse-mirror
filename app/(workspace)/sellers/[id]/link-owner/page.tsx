import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { LinkOwnerPicker } from "@/components/link-owner-picker";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ilike, parseListParams, totalPages } from "@/lib/list-params";
import { prisma } from "@/lib/prisma";

import { linkSellerAction } from "../../../owners/actions";

export const dynamic = "force-dynamic";

export default async function SellerLinkOwnerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { q?: string; page?: string };
}) {
  const user = await requireUser();
  if (!can(user.role, "UPDATE", "OWNER")) notFound();

  const seller = await prisma.seller.findFirst({ where: { id: params.id, organizationId: user.organizationId }, select: { id: true, name: true, ownerId: true } });
  if (!seller) notFound();

  const par = parseListParams(searchParams, { sortKeys: ["recent"], defaultSort: "recent" });
  const where: Prisma.OwnerWhereInput = { organizationId: user.organizationId, status: "ACTIVE" };
  if (par.hasQuery) where.OR = [{ displayName: ilike(par.q) }, { matchKey: ilike(par.q) }];

  const [total, owners] = await Promise.all([
    prisma.owner.count({ where }),
    prisma.owner.findMany({ where, select: { id: true, displayName: true, entityType: true }, orderBy: { updatedAt: "desc" }, skip: par.skip, take: par.take }),
  ]);

  return (
    <LinkOwnerPicker
      recordName={seller.name}
      basePath={`/sellers/${seller.id}/link-owner`}
      redirectTo={`/sellers/${seller.id}`}
      action={linkSellerAction}
      recordField="sellerId"
      recordId={seller.id}
      currentOwnerId={seller.ownerId}
      owners={owners}
      q={par.q}
      hasQuery={par.hasQuery}
      page={par.page}
      pages={totalPages(total)}
    />
  );
}
