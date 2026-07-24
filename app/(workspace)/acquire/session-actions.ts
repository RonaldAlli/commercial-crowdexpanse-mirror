"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clampGoal, DEFAULT_SESSION_GOAL } from "@/lib/acquisition-session";

// Start / end an acquisition calling session. A session is this operator's own goal + time window; the bar's
// numbers are derived from facts (see acquisition-session-store), so start/end only manage the window itself.

/** Open a session for the current operator. Closes any already-open one first so there's exactly one active. */
export async function startAcquisitionSession(formData: FormData): Promise<void> {
  const user = await requireUser();
  const goalRaw = Number(String(formData.get("goalCalls") ?? "").trim());
  const goalCalls = clampGoal(Number.isFinite(goalRaw) && goalRaw > 0 ? goalRaw : DEFAULT_SESSION_GOAL);

  await prisma.$transaction(async (tx) => {
    await tx.acquisitionSession.updateMany({
      where: { organizationId: user.organizationId, userId: user.id, endedAt: null },
      data: { endedAt: new Date() },
    });
    await tx.acquisitionSession.create({
      data: { organizationId: user.organizationId, userId: user.id, goalCalls },
    });
  });

  revalidatePath("/acquire");
}

/** Close the operator's open session (if any). Idempotent. Ends whether running or paused. */
export async function endAcquisitionSession(): Promise<void> {
  const user = await requireUser();
  await prisma.acquisitionSession.updateMany({
    where: { organizationId: user.organizationId, userId: user.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  revalidatePath("/acquire");
}

/** Pause the running session: stops auto-progression and drops the cockpit takeover (chrome returns). */
export async function pauseAcquisitionSession(): Promise<void> {
  const user = await requireUser();
  await prisma.acquisitionSession.updateMany({
    where: { organizationId: user.organizationId, userId: user.id, endedAt: null, pausedAt: null },
    data: { pausedAt: new Date() },
  });
  revalidatePath("/acquire");
}

/** Resume a paused session: re-enters the cockpit and accrues the paused span into pausedMs. */
export async function resumeAcquisitionSession(): Promise<void> {
  const user = await requireUser();
  const paused = await prisma.acquisitionSession.findFirst({
    where: { organizationId: user.organizationId, userId: user.id, endedAt: null, pausedAt: { not: null } },
    select: { id: true, pausedAt: true, pausedMs: true },
  });
  if (paused?.pausedAt) {
    const span = Math.max(0, Date.now() - paused.pausedAt.getTime());
    await prisma.acquisitionSession.update({
      where: { id: paused.id },
      data: { pausedAt: null, pausedMs: paused.pausedMs + span },
    });
  }
  revalidatePath("/acquire");
}

/** Exit the cockpit safely WITHOUT ending: pause, then leave to the ordinary workspace (not browser-back). */
export async function exitCockpit(): Promise<void> {
  await pauseAcquisitionSession();
  redirect("/dashboard");
}
