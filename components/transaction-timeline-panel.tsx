// Closing Center Slice 6 — Transaction Timeline (TX-0): the read-only presentation. Renders one
// Opportunity's recorded event history beside the Closing Center — the historical complement to
// the current-state view. Server component: the newest/oldest toggle and pagination are plain GET
// links (no client JS, no mutation, TL-6). Every row is a persisted event (TL-10); a row that maps
// to an immutable snapshot links OUT to the authoritative artifact (TL-11). It owns no state.
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import type { OpportunityTimeline } from "@/lib/transaction-timeline-service";

const ANCHOR = "timeline";

/** Build a `?tlorder=&tlpage=#timeline` href, preserving the anchor so the viewport stays put. */
function href(basePath: string, order: string, page: number): string {
  const params = new URLSearchParams();
  if (order !== "newest") params.set("tlorder", order);
  if (page > 1) params.set("tlpage", String(page));
  const qs = params.toString();
  return `${basePath}${qs ? `?${qs}` : ""}#${ANCHOR}`;
}

function fmt(iso: string): string {
  // UTC, deterministic across environments (matches the dashboard's date convention).
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function TransactionTimelinePanel({
  timeline,
  basePath,
}: {
  timeline: OpportunityTimeline;
  basePath: string;
}) {
  const { entries, order, page, pageCount, total } = timeline;
  const otherOrder = order === "newest" ? "oldest" : "newest";

  return (
    <article id={ANCHOR} className="card scroll-mt-6">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Transaction Timeline</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {total === 0 ? "Recorded activity for this deal" : `${total} recorded ${total === 1 ? "event" : "events"}`}
          </p>
        </div>
        {total > 0 ? (
          <Link
            href={href(basePath, otherOrder, 1)}
            className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-100 hover:bg-brand-50"
            aria-label={`Sort ${otherOrder} first`}
          >
            {order === "newest" ? "Show oldest first" : "Show newest first"}
          </Link>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <>
          <ul className="px-5 py-2">
            {entries.map((entry, i) => (
              <li key={entry.id} className="flex gap-4 py-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                  {i < entries.length - 1 ? <span className="mt-1 w-px flex-1 bg-slate-200" /> : null}
                </div>
                <div className="min-w-0 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={entry.tone}>{entry.categoryLabel}</Badge>
                    <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                  </div>
                  {entry.detail ? <p className="mt-0.5 text-xs text-slate-500">{entry.detail}</p> : null}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {fmt(entry.occurredAtIso)} · {entry.actorName}
                  </p>
                  {entry.reference ? (
                    <Link href={entry.reference.href} className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">
                      {entry.reference.label} →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs">
              {page > 1 ? (
                <Link href={href(basePath, order, page - 1)} className="font-medium text-brand-700 hover:underline">
                  ← Newer page
                </Link>
              ) : (
                <span className="text-slate-300">← Newer page</span>
              )}
              <span className="text-slate-400">
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={href(basePath, order, page + 1)} className="font-medium text-brand-700 hover:underline">
                  Older page →
                </Link>
              ) : (
                <span className="text-slate-300">Older page →</span>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState icon="activity" title="No activity yet" />
      )}
    </article>
  );
}
