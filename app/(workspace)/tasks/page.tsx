import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { TaskStatusSelect } from "@/components/task-status-select";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_OPTIONS } from "@/lib/task-options";

import { setTaskStatus } from "./actions";

export const dynamic = "force-dynamic";

// Open tasks first (by due date), completed last.
const STATUS_ORDER: Record<string, number> = { BLOCKED: 0, IN_PROGRESS: 1, BACKLOG: 2, COMPLETE: 3 };

export default async function TasksPage() {
  const user = await requireUser();

  const tasks = await prisma.task.findMany({
    where: { organizationId: user.organizationId },
    include: {
      owner: { select: { name: true } },
      opportunity: { select: { id: true, title: true } },
    },
  });

  tasks.sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s !== 0) return s;
    const ad = a.dueDate ? a.dueDate.getTime() : Infinity;
    const bd = b.dueDate ? b.dueDate.getTime() : Infinity;
    return ad - bd;
  });

  return (
    <div className="space-y-6">
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

      {tasks.length > 0 ? (
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
                {tasks.map((task) => (
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
      ) : (
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
      )}
    </div>
  );
}
