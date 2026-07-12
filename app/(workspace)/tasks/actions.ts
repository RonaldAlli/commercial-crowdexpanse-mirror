"use server";

import { TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/task-options";

export type TaskFormState = { error?: string } | undefined;

const VALID_STATUSES = new Set<string>(Object.values(TaskStatus));

function orNull(value: string) {
  return value.length ? value : null;
}

function dateOrNull(raw: string) {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Resolve title/status plus opportunity + owner within the caller's org. */
async function buildPayload(formData: FormData, organizationId: string, forCreate: boolean) {
  const str = (key: string) => String(formData.get(key) ?? "").trim();

  const title = str("title");
  if (!title) return { error: "Task title is required." } as const;

  const statusRaw = str("status");
  let status: TaskStatus;
  if (statusRaw) {
    if (!VALID_STATUSES.has(statusRaw)) return { error: "Select a valid status." } as const;
    status = statusRaw as TaskStatus;
  } else if (forCreate) {
    status = TaskStatus.BACKLOG;
  } else {
    return { error: "Select a valid status." } as const;
  }

  let opportunityId: string | null = null;
  if (str("opportunityId")) {
    const opp = await prisma.opportunity.findFirst({
      where: { id: str("opportunityId"), organizationId },
      select: { id: true },
    });
    if (!opp) return { error: "Selected opportunity was not found in your organization." } as const;
    opportunityId = opp.id;
  }

  let ownerId: string | null = null;
  if (str("ownerId")) {
    const owner = await prisma.user.findFirst({
      where: { id: str("ownerId"), organizationId },
      select: { id: true },
    });
    if (!owner) return { error: "Selected owner was not found in your organization." } as const;
    ownerId = owner.id;
  }

  return {
    payload: {
      title,
      description: orNull(str("description")),
      status,
      dueDate: dateOrNull(str("dueDate")),
      opportunityId,
      ownerId,
    },
  } as const;
}

export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const user = await requireUser();
  const result = await buildPayload(formData, user.organizationId, true);
  if ("error" in result) return { error: result.error };

  const task = await prisma.task.create({
    data: { organizationId: user.organizationId, ...result.payload },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: task.opportunityId,
      actorId: user.id,
      eventType: "task.created",
      eventLabel: `Task created: ${task.title}`,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect(`/tasks/${task.id}`);
}

export async function updateTask(
  id: string,
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const user = await requireUser();

  const existing = await prisma.task.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return { error: "Task not found." };

  const result = await buildPayload(formData, user.organizationId, false);
  if ("error" in result) return { error: result.error };

  const task = await prisma.task.update({ where: { id: existing.id }, data: result.payload });

  const becameComplete = existing.status !== TaskStatus.COMPLETE && task.status === TaskStatus.COMPLETE;

  const nonStatusChanged =
    existing.title !== task.title ||
    existing.description !== task.description ||
    existing.opportunityId !== task.opportunityId ||
    existing.ownerId !== task.ownerId ||
    existing.dueDate?.getTime() !== task.dueDate?.getTime();

  const statusChangedNotComplete = existing.status !== task.status && !becameComplete;

  if (becameComplete) {
    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        opportunityId: task.opportunityId,
        actorId: user.id,
        eventType: "task.completed",
        eventLabel: `Task completed: ${task.title}`,
      },
    });
  }

  if (nonStatusChanged || statusChangedNotComplete) {
    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        opportunityId: task.opportunityId,
        actorId: user.id,
        eventType: "task.updated",
        eventLabel: `Task updated: ${task.title}`,
      },
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${task.id}`);
  redirect(`/tasks/${task.id}`);
}

/** Inline status change from the task list. Logs task.completed or task.updated. */
export async function setTaskStatus(id: string, formData: FormData) {
  const user = await requireUser();
  const next = String(formData.get("status") ?? "").trim();
  if (!VALID_STATUSES.has(next)) return;

  const existing = await prisma.task.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing || existing.status === next) return;

  await prisma.task.update({ where: { id: existing.id }, data: { status: next as TaskStatus } });

  const becameComplete = existing.status !== TaskStatus.COMPLETE && next === TaskStatus.COMPLETE;

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: existing.opportunityId,
      actorId: user.id,
      eventType: becameComplete ? "task.completed" : "task.updated",
      eventLabel: becameComplete
        ? `Task completed: ${existing.title}`
        : `Task status: ${statusLabel(existing.status)} → ${statusLabel(next)}`,
    },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${existing.id}`);
  revalidatePath("/dashboard");
}

export async function deleteTask(id: string) {
  const user = await requireUser();
  await authorize(user, "DELETE", "TASK", { targetId: id });

  const existing = await prisma.task.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    redirect("/tasks");
  }

  await prisma.task.delete({ where: { id: existing.id } });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: existing.opportunityId,
      actorId: user.id,
      eventType: "task.deleted",
      eventLabel: `Task deleted: ${existing.title}`,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect("/tasks");
}
