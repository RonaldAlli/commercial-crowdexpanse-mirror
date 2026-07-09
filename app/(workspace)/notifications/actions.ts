"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";

/** Advance the caller's notification read cursor to now. */
export async function markNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await markAllRead(user.id, user.organizationId);
  revalidatePath("/notifications");
}
