import { PageHeader } from "@/components/page-header";
import { TaskForm } from "@/components/task-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_OPTIONS } from "@/lib/task-options";

import { createTask } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const user = await requireUser();

  const [owners, opportunities] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: user.organizationId, lifecycleState: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.opportunity.findMany({ where: { organizationId: user.organizationId }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Workflow" title="New task" description="Create an execution item and optionally link it to a deal." />
      <div className="card p-6">
        <TaskForm
          action={createTask}
          statuses={STATUS_OPTIONS}
          owners={owners}
          opportunities={opportunities.map((o) => ({ value: o.id, label: o.title }))}
          submitLabel="Create task"
          cancelHref="/tasks"
        />
      </div>
    </div>
  );
}
