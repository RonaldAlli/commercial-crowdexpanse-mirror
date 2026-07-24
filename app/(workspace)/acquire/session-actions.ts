"use server";

import { revalidatePath } from "next/cache";

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

/** Close the operator's open session (if any). Idempotent. */
export async function endAcquisitionSession(): Promise<void> {
  const user = await requireUser();
  await prisma.acquisitionSession.updateMany({
    where: { organizationId: user.organizationId, userId: user.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  revalidatePath("/acquire");
}
