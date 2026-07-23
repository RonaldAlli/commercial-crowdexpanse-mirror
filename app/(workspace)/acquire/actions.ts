"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { checkAuthorized } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { isDisposition, dispositionEffect } from "@/lib/disposition";
import { safeInternalPath } from "@/lib/safe-redirect";

function parseFollowUp(raw: string): Date | null | undefined {
  if (!raw) return undefined; // untouched — leave the existing follow-up alone
  const d = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * The operator console's core action: record a call disposition. Logs a CALL ContactTouch, applies the
 * disposition's side-effect (status progression / DNC / bad-phone — see lib/disposition), optionally sets
 * the next follow-up, then advances to the next seller (redirectTo). Reuses ContactTouch/Seller/ActivityLog
 * primitives; the semantics live in the pure dispositionEffect(). Gated by UPDATE SELLER.
 */
export async function recordDisposition(sellerId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "SELLER", { targetId: sellerId, sellerId }))) return;

  const value = String(formData.get("disposition") ?? "").trim();
  if (!isDisposition(value)) return;
  const effect = dispositionEffect(value);
  const followUp = parseFollowUp(String(formData.get("nextFollowUpAt") ?? "").trim());
  const redirectTo = safeInternalPath(formData.get("redirectTo"), "/acquire");

  const existing = await prisma.seller.findFirst({
    where: { id: sellerId, organizationId: user.organizationId },
    select: { id: true, name: true },
  });
  if (!existing) redirect(redirectTo);

  await prisma.$transaction(async (tx) => {
    await tx.contactTouch.create({
      data: { organizationId: user.organizationId, sellerId: existing.id, type: "CALL", summary: effect.summary, createdById: user.id },
    });
    await tx.seller.update({
      where: { id: existing.id },
      data: {
        ...(followUp !== undefined ? { nextFollowUpAt: followUp } : {}),
        ...(effect.outreachStatus ? { outreachStatus: effect.outreachStatus } : {}),
        ...(effect.badPhone ? { badPhone: true } : {}),
        ...(effect.doNotCall ? { doNotCall: true } : {}),
      },
    });
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      sellerId: existing.id,
      actorId: user.id,
      eventType: "contact.touch_logged",
      eventLabel: `${effect.summary} — ${existing.name}`,
    },
  });

  revalidatePath("/acquire");
  redirect(redirectTo);
}
