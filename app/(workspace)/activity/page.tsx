import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge, type Tone } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { resolveNoteLink } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "seller", label: "Sellers" },
  { key: "buyer", label: "Buyers" },
  { key: "property", label: "Properties" },
  { key: "opportunity", label: "Opportunities" },
  { key: "task", label: "Tasks" },
  { key: "note", label: "Notes" },
  { key: "document", label: "Documents" },
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  seller: "Seller",
  buyer: "Buyer",
  property: "Property",
  opportunity: "Opportunity",
  task: "Task",
  note: "Note",
  document: "Document",
  analysis: "Analysis",
};

function eventTone(eventType: string): Tone {
  if (eventType.endsWith(".deleted")) return "danger";
  if (eventType.endsWith(".created")) return "success";
  if (eventType.endsWith(".completed") || eventType.endsWith(".stage_changed")) return "brand";
  return "info";
}

function categoryOf(eventType: string) {
  return eventType.split(".")[0];
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: { type?: string; page?: string };
}) {
  const user = await requireUser();

  const category = CATEGORIES.some((c) => c.key === searchParams.type) ? (searchParams.type as string) : "all";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const where: Prisma.ActivityLogWhereInput = { organizationId: user.organizationId };
  if (category !== "all") {
    where.eventType = { startsWith: `${category}.` };
  }

  const [total, rows] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      include: {
        actor: { select: { name: true } },
        seller: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true } },
        property: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (params: Record<string, string | number>) =>
    "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Activity timeline"
        title="Activity"
        description="Operational movement across sellers, buyers, properties, deals, tasks, notes, and documents."
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const active = c.key === category;
          return (
            <Link
              key={c.key}
              href={qs({ type: c.key })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      {rows.length > 0 ? (
        <>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const link = resolveNoteLink(row);
                const cat = categoryOf(row.eventType);
                return (
                  <li key={row.id} className="flex gap-4 px-5 py-4">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${row.eventType.endsWith(".deleted") ? "bg-rose-400" : "bg-brand-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="text-sm font-medium text-slate-900">{row.eventLabel}</p>
                        <span className="shrink-0 text-xs text-slate-400">
                          {row.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                      {row.eventBody ? <p className="mt-0.5 text-sm text-slate-500">{row.eventBody}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <Badge tone={eventTone(row.eventType)}>{CATEGORY_LABEL[cat] ?? cat}</Badge>
                        <span className="text-slate-400">{row.eventType}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500">{row.actor?.name ?? "System"}</span>
                        {link ? (
                          <>
                            <span className="text-slate-300">·</span>
                            <Link href={link.href} className="text-brand-700 hover:underline">
                              {link.label}: {link.name}
                            </Link>
                          </>
                        ) : null}
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-400">{user.organizationName}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {total} event{total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link className="btn-ghost" href={qs({ type: category, page: page - 1 })}>
                  Previous
                </Link>
              ) : (
                <span className="btn-ghost cursor-not-allowed opacity-40">Previous</span>
              )}
              {page < totalPages ? (
                <Link className="btn-ghost" href={qs({ type: category, page: page + 1 })}>
                  Next
                </Link>
              ) : (
                <span className="btn-ghost cursor-not-allowed opacity-40">Next</span>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <EmptyState
            icon="activity"
            title={category === "all" ? "No activity yet" : `No ${category} activity`}
            description="Actions across the workspace — creates, updates, stage moves, and deletes — will appear here."
          />
        </div>
      )}
    </div>
  );
}
