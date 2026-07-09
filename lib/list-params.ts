import type { Prisma } from "@prisma/client";

// Shared, pure parsing for list pages (search + sort + pagination). Each page
// keeps its own typed where/orderBy built from these normalized params; this is
// the single source of truth for the parsing rules so behavior can't drift.
// Imported by list pages and the focused E2E.

export const LIST_PAGE_SIZE = 20;
export const LIST_MIN_QUERY = 2;

export type ListParams = {
  q: string; // trimmed search term
  hasQuery: boolean; // true only when q clears the min length (so we actually filter)
  sort: string; // resolved against the page's whitelist, never a raw param
  page: number; // >= 1
  skip: number;
  take: number;
};

/**
 * Normalize raw GET params into safe list params. `sort` is resolved against an
 * explicit whitelist (an unknown/garbage value falls back to defaultSort — never
 * passed raw into orderBy). `page` is clamped to >= 1. Short/empty queries are
 * treated as "no filter".
 */
export function parseListParams(
  raw: { q?: string; sort?: string; page?: string },
  opts: { sortKeys: readonly string[]; defaultSort: string; pageSize?: number },
): ListParams {
  const pageSize = opts.pageSize ?? LIST_PAGE_SIZE;
  const q = (raw.q ?? "").trim();
  const hasQuery = q.length >= LIST_MIN_QUERY;
  const sort = opts.sortKeys.includes(raw.sort ?? "") ? (raw.sort as string) : opts.defaultSort;
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);
  return { q, hasQuery, sort, page, skip: (page - 1) * pageSize, take: pageSize };
}

export function totalPages(total: number, pageSize: number = LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Build a "?a=b&c=d" string, dropping empty/undefined values. */
export function listQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string]);
  const qs = new URLSearchParams(entries).toString();
  return qs ? `?${qs}` : "";
}

/** Case-insensitive substring matcher (ILIKE) for a String field. */
export function ilike(term: string): Prisma.StringFilter {
  return { contains: term, mode: "insensitive" };
}
