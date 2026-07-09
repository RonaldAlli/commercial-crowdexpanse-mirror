import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { TaskStatusSelect } from "@/components/task-status-select";
import { requireUser } from "@/lib/auth";
import { ilike, listQueryString, parseListParams, totalPages } from "@/lib/list-params";
import { sortTasks, TASK_SORT_KEYS } from "@/lib/task-sort";
import { prisma } from "@/lib/prisma";
import { STATUS_OPTIONS } from "@/lib/task-options";

import { setTaskStatus } from "./actions";

export const dynamic = "force-dynamic";

const SORT_OPTIONS = [
  { value: "workflow", label: "Workflow" }, // default — preserves the previous ordering
  { value: "due", label: "Due date" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title A–Z" },
] as const;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; page?: string };
}) {
  const user = await requireUser();
  const params = parseListParams(searchParams, { sortKeys: TASK_SORT_KEYS, defaultSort: "workflow" });

  const where: import("@prisma/client").Prisma.TaskWhereInput = { organizationId: user.organizationId };
  if (params.hasQuery) {
    where.OR = [{ title: ilike(params.q) }, { description: ilike(params.q) }];
  }

  // The default "workflow" ordering isn't DB-expressible (custom status priority),
  // so we fetch the full filtered set in a stable base order, sort in memory, and
  // slice for the page. A stable base order + stable sort => deterministic pages.
  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        opportunity: { select: { id: true, title: true } },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  // No tasks at all (unfiltered) → global empty state.
  if (total === 0 && !params.hasQuery) {
    return (
      <div className="space-y-6">
        <TasksHeader />
        <div className="card">
          <EmptyState
            icon="tasks"
            title="No tasks yet"
            description="Create execution items to drive deals toward close."
            action={
              <Link className="btn-primary" href="/tasks/new">
                New task
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const pageRows = sortTasks(rows, params.sort as (typeof TASK_SORT_KEYS)[number]).slice(
    params.skip,
    params.skip + params.take,
  );
  const pages = totalPages(total);
  const pageLink = (page: number) => listQueryString({ q: params.q, sort: params.sort, page });

  return (
    <div className="space-y-6">
      <TasksHeader />

      {/* Search + sort (GET form — no JS required; submitting resets to page 1) */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Search
          <input
            className="input h-9 py-0 text-sm"
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Title or description…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Sort
          <select name="sort" defaultValue={params.sort} className="input h-9 w-44 py-0 text-sm">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Apply
        </button>
        {params.hasQuery ? (
          <Link href="/tasks" className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {total > 0 ? (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50/60">
                  <tr>
                    <th className="table-head">Task</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Owner</th>
                    <th className="table-head">Due</th>
                    <th className="table-head">Opportunity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((task) => (
                    <tr key={task.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="table-cell">
                        <Link href={`/tasks/${task.id}`} className={`font-medium hover:text-brand-700 ${task.status === "COMPLETE" ? "text-slate-400 line-through" : "text-slate-900"}`}>
                          {task.title}
                        </Link>
                        {task.description ? <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">{task.description}</p> : null}
                      </td>
                      <td className="table-cell">
                        <TaskStatusSelect action={setTaskStatus.bind(null, task.id)} current={task.status} statuses={STATUS_OPTIONS} />
                      </td>
                      <td className="table-cell whitespace-nowrap text-slate-600">{task.owner?.name ?? "Unassigned"}</td>
                      <td className="table-cell whitespace-nowrap">
                        {task.dueDate ? task.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        {task.opportunity ? (
                          <Link href={`/opportunities/${task.opportunity.id}`} className="text-brand-700 hover:underline">
                            {task.opportunity.title}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {total} task{total === 1 ? "" : "s"} · page {params.page} of {pages}
            </span>
            <div className="flex gap-2">
              {params.page > 1 ? (
                <Link className="btn-ghost" href={pageLink(params.page - 1)}>
                  Previous
                </Link>
              ) : (
                <span className="btn-ghost cursor-not-allowed opacity-40">Previous</span>
              )}
              {params.page < pages ? (
                <Link className="btn-ghost" href={pageLink(params.page + 1)}>
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
            icon="tasks"
            title="No tasks match"
            description={`Nothing matched “${params.q}”. Try a different search or clear it.`}
            action={
              <Link className="btn-primary" href="/tasks">
                Clear search
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}

function TasksHeader() {
  return (
    <PageHeader
      eyebrow="Workflow"
      title="Tasks"
      description="Execution items across the acquisition pipeline."
      actions={
        <Link className="btn-primary" href="/tasks/new">
          New task
          <Icon name="arrowUpRight" className="h-4 w-4" />
        </Link>
      }
    />
  );
}
