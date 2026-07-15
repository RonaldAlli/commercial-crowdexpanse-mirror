"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { reversePropertyResolution } from "@/lib/intelligence/property-resolver";

// Resolution reversal action (v1.2, Commit 2c-iii). A high-risk identity-governance
// operation → MANAGE PROPERTY_IDENTITY. It is a thin wrapper over the engine's
// reversePropertyResolution: the engine APPENDS a REVERSAL event and revokes the
// crosswalk attachments (RES-7) — the original RESOLVE event and its basis are never
// mutated. The UI never rewrites history; it only requests the engine's reversal.

export async function reversePropertyResolutionAction(formData: FormData) {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "MANAGE", "PROPERTY_IDENTITY"))) throw new Error(GENERIC_DENIAL);

  const resolutionId = String(formData.get("resolutionId") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  if (!resolutionId || !propertyId) throw new Error("Missing resolution to reverse.");

  const reversal = await reversePropertyResolution(user.organizationId, resolutionId, { actorUserId: user.id, reason });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      propertyId,
      actorId: user.id,
      eventType: "property.resolution_reversed",
      eventLabel: "Property resolution reversed",
      eventBody: JSON.stringify({ resolutionId, reversalId: reversal.id, reason: reason ?? null, actorUserId: user.id }),
    },
  });

  revalidatePath(`/properties/${propertyId}/identity`);
}
