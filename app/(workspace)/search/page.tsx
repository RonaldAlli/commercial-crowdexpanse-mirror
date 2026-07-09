import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { searchAll, SEARCH_GROUP_CAP, SEARCH_MIN_LENGTH } from "@/lib/search";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await requireUser();
  const rawQuery = searchParams.q ?? "";
  const results = await searchAll(user.organizationId, rawQuery);

  const hasQuery = rawQuery.trim().length > 0;
  const groupsWithHits = results.groups.filter((g) => g.hits.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Search"
        description="Find opportunities, properties, sellers, and buyers across your organization."
      />

      {/* GET form — mirrors the header input; no JS required. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Query
          <input
            className="input h-10"
            name="q"
            type="search"
            defaultValue={rawQuery}
            placeholder="Search deals, sellers, buyers, properties…"
            autoFocus
          />
        </label>
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      {!hasQuery ? (
        <div className="card">
          <EmptyState
            icon="search"
            title="Search your workspace"
            description="Type a name, title, address, or company to find records."
          />
        </div>
      ) : results.tooShort ? (
        <div className="card">
          <EmptyState
            icon="search"
            title="Keep typing"
            description={`Enter at least ${SEARCH_MIN_LENGTH} characters to search.`}
          />
        </div>
      ) : groupsWithHits.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="search"
            title="No matches"
            description={`Nothing matched “${results.query}”. Try a different term.`}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groupsWithHits.map((group) => (
            <section key={group.key} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-slate-900">{group.label}</h2>
                {group.capped ? (
                  <span className="text-xs text-slate-400">
                    Showing first {SEARCH_GROUP_CAP}
                  </span>
                ) : null}
              </div>
              <ul className="divide-y divide-slate-100">
                {group.hits.map((hit) => (
                  <li key={hit.id}>
                    <Link
                      href={hit.href}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{hit.title}</p>
                        {hit.subtitle ? (
                          <p className="truncate text-xs text-slate-500">{hit.subtitle}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-brand-600">View →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hasQuery && !results.tooShort ? (
        <p className="text-xs text-slate-400">
          {results.total} result{results.total === 1 ? "" : "s"} · {user.organizationName}
        </p>
      ) : null}
    </div>
  );
}
