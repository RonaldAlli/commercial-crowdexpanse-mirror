import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { TaskForm } from "@/components/task-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_OPTIONS } from "@/lib/task-options";

import { updateTask } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditTaskPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const [task, owners, opportunities] = await Promise.all([
    prisma.task.findFirst({ where: { id: params.id, organizationId: user.organizationId } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.opportunity.findMany({ where: { organizationId: user.organizationId }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
  ]);

  if (!task) {
    notFound();
  }

  const action = updateTask.bind(null, task.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Workflow" title={`Edit ${task.title}`} description="Update this task." />
      <div className="card p-6">
        <TaskForm
          action={action}
          statuses={STATUS_OPTIONS}
          owners={owners}
          opportunities={opportunities.map((o) => ({ value: o.id, label: o.title }))}
          values={{
            title: task.title,
            description: task.description,
            status: task.status,
            dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "",
            ownerId: task.ownerId,
            opportunityId: task.opportunityId,
          }}
          submitLabel="Save changes"
          cancelHref={`/tasks/${task.id}`}
        />
      </div>
    </div>
  );
}
