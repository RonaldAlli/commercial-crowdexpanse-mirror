import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Global search across the four primary records. Deterministic, org-scoped,
// case-insensitive substring match (ILIKE). No AI, no schema changes. This is
// the single source of truth for the query logic — imported by both the
// /search page and the focused E2E so the two can never drift.

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_GROUP_CAP = 5;

export type SearchHit = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type SearchGroup = {
  key: "opportunities" | "properties" | "sellers" | "buyers";
  label: string;
  hits: SearchHit[];
  capped: boolean; // true when more matches exist beyond the cap
};

export type SearchResults = {
  query: string;
  tooShort: boolean;
  groups: SearchGroup[];
  total: number; // count of hits shown (bounded by the per-group cap)
};

/** Case-insensitive "contains" matcher for one field. */
function like(term: string): Prisma.StringFilter {
  return { contains: term, mode: "insensitive" };
}

function joinParts(parts: (string | null | undefined)[]): string | null {
  const cleaned = parts.filter((p): p is string => Boolean(p && p.trim()));
  return cleaned.length ? cleaned.join(" · ") : null;
}

/**
 * Run the four org-scoped searches concurrently. Each query fetches one row
 * beyond the cap so we can flag "more results exist" without a second count.
 */
export async function searchAll(organizationId: string, rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim();
  const tooShort = query.length < SEARCH_MIN_LENGTH;
  if (tooShort) {
    return { query, tooShort: true, groups: [], total: 0 };
  }

  const take = SEARCH_GROUP_CAP + 1;

  const [opportunities, properties, sellers, buyers] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        organizationId,
        OR: [{ title: like(query) }, { source: like(query) }, { summary: like(query) }],
      },
      select: { id: true, title: true, source: true, property: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take,
    }),
    prisma.property.findMany({
      where: {
        organizationId,
        OR: [
          { name: like(query) },
          { addressLine1: like(query) },
          { city: like(query) },
          { county: like(query) },
        ],
      },
      select: { id: true, name: true, city: true, state: true },
      orderBy: { updatedAt: "desc" },
      take,
    }),
    prisma.seller.findMany({
      where: {
        organizationId,
        OR: [
          { name: like(query) },
          { company: like(query) },
          { email: like(query) },
          { city: like(query) },
        ],
      },
      select: { id: true, name: true, company: true, city: true, state: true },
      orderBy: { updatedAt: "desc" },
      take,
    }),
    prisma.buyer.findMany({
      where: {
        organizationId,
        OR: [{ name: like(query) }, { company: like(query) }, { email: like(query) }],
      },
      select: { id: true, name: true, company: true, email: true },
      orderBy: { updatedAt: "desc" },
      take,
    }),
  ]);

  const groups: SearchGroup[] = [
    {
      key: "opportunities",
      label: "Opportunities",
      capped: opportunities.length > SEARCH_GROUP_CAP,
      hits: opportunities.slice(0, SEARCH_GROUP_CAP).map((o) => ({
        id: o.id,
        title: o.title,
        subtitle: joinParts([o.property?.name, o.source]),
        href: `/opportunities/${o.id}`,
      })),
    },
    {
      key: "properties",
      label: "Properties",
      capped: properties.length > SEARCH_GROUP_CAP,
      hits: properties.slice(0, SEARCH_GROUP_CAP).map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: joinParts([p.city, p.state]),
        href: `/properties/${p.id}`,
      })),
    },
    {
      key: "sellers",
      label: "Sellers",
      capped: sellers.length > SEARCH_GROUP_CAP,
      hits: sellers.slice(0, SEARCH_GROUP_CAP).map((s) => ({
        id: s.id,
        title: s.name,
        subtitle: joinParts([s.company, joinParts([s.city, s.state])]),
        href: `/sellers/${s.id}`,
      })),
    },
    {
      key: "buyers",
      label: "Buyers",
      capped: buyers.length > SEARCH_GROUP_CAP,
      hits: buyers.slice(0, SEARCH_GROUP_CAP).map((b) => ({
        id: b.id,
        title: b.name,
        subtitle: joinParts([b.company, b.email]),
        href: `/buyers/${b.id}`,
      })),
    },
  ];

  const total = groups.reduce((sum, g) => sum + g.hits.length, 0);
  return { query, tooShort: false, groups, total };
}
