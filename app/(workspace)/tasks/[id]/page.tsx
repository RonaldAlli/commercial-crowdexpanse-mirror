import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { TaskStatusSelect } from "@/components/task-status-select";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_OPTIONS, statusLabel, taskStatusTone } from "@/lib/task-options";

import { deleteTask, setTaskStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const task = await prisma.task.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      owner: { select: { name: true, email: true } },
      opportunity: { select: { id: true, title: true } },
    },
  });

  if (!task) {
    notFound();
  }

  const deleteTaskBound = deleteTask.bind(null, task.id);

  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Owner", value: task.owner?.name ?? "Unassigned" },
    { label: "Due date", value: task.dueDate ? task.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—" },
    {
      label: "Opportunity",
      value: task.opportunity ? (
        <Link href={`/opportunities/${task.opportunity.id}`} className="text-brand-700 hover:underline">
          {task.opportunity.title}
        </Link>
      ) : (
        "—"
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Task"
        title={task.title}
        actions={
          <>
            <Link className="btn-ghost" href={`/tasks/${task.id}/edit`}>
              <Icon name="notes" className="h-4 w-4" />
              Edit
            </Link>
            <form action={deleteTaskBound}>
              <button type="submit" className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
                Delete
              </button>
            </form>
          </>
        }
      />

      <article className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="eyebrow">Status</p>
            <Badge tone={taskStatusTone(task.status)}>{statusLabel(task.status)}</Badge>
          </div>
          <TaskStatusSelect action={setTaskStatus.bind(null, task.id)} current={task.status} statuses={STATUS_OPTIONS} />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-xs text-slate-500">{d.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{d.value}</dd>
            </div>
          ))}
        </dl>

        {task.description ? (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="eyebrow">Description</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{task.description}</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}
