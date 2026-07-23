"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authorize, checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { isAcquisitionChannel } from "@/lib/acquisition-options";
import { isOutreachStatus, outreachStatusLabel } from "@/lib/contact-options";
import { prisma } from "@/lib/prisma";

export type SellerFormState = { error?: string } | undefined;

function parseSeller(formData: FormData) {
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: value("name"),
    company: value("company"),
    email: value("email"),
    phone: value("phone"),
    city: value("city"),
    state: value("state"),
    motivation: value("motivation"),
    acquisitionChannel: value("acquisitionChannel"),
    acquisitionCampaign: value("acquisitionCampaign"),
  };
}

function orNull(value: string) {
  return value.length ? value : null;
}

export async function createSeller(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "CREATE", "SELLER"))) return { error: GENERIC_DENIAL };
  const data = parseSeller(formData);

  if (!data.name) {
    return { error: "Seller name is required." };
  }

  // Attribution Rule 1: acquisition channel is REQUIRED at the app layer for new manual sellers,
  // so the source gap never reopens one lead at a time (the DB column stays nullable for backfill).
  if (!isAcquisitionChannel(data.acquisitionChannel)) {
    return { error: "An acquisition channel is required." };
  }

  const seller = await prisma.seller.create({
    data: {
      organizationId: user.organizationId,
      name: data.name,
      company: orNull(data.company),
      email: orNull(data.email),
      phone: orNull(data.phone),
      city: orNull(data.city),
      state: orNull(data.state),
      motivation: orNull(data.motivation),
      acquisitionChannel: data.acquisitionChannel,
      acquisitionCampaign: orNull(data.acquisitionCampaign),
      // acquisitionEventKey stays null for manual entry (no import event). Layer 3 is set by importers.
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      sellerId: seller.id,
      actorId: user.id,
      eventType: "seller.created",
      eventLabel: `Seller added: ${seller.name}`,
      eventBody: data.company ? `${seller.name} · ${data.company}` : null,
    },
  });

  revalidatePath("/sellers");
  revalidatePath("/dashboard");
  redirect(`/sellers/${seller.id}`);
}

export async function updateSeller(
  id: string,
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "SELLER", { targetId: id, sellerId: id }))) {
    return { error: GENERIC_DENIAL };
  }
  const data = parseSeller(formData);

  if (!data.name) {
    return { error: "Seller name is required." };
  }

  // Channel remains required on edit (also backfills a pre-attribution seller). Editing the LEAD's
  // own channel is allowed (correction); it never rewrites the frozen attribution already stamped on
  // opportunities derived from this seller (AC-ATTR-5).
  if (!isAcquisitionChannel(data.acquisitionChannel)) {
    return { error: "An acquisition channel is required." };
  }

  // Org-scope guard: only touch sellers that belong to this organization.
  const existing = await prisma.seller.findFirst({
    where: { id, organizationId: user.organizationId },
  });

  if (!existing) {
    return { error: "Seller not found." };
  }

  await prisma.seller.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      company: orNull(data.company),
      email: orNull(data.email),
      phone: orNull(data.phone),
      city: orNull(data.city),
      state: orNull(data.state),
      motivation: orNull(data.motivation),
      acquisitionChannel: data.acquisitionChannel,
      acquisitionCampaign: orNull(data.acquisitionCampaign),
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      sellerId: existing.id,
      actorId: user.id,
      eventType: "seller.updated",
      eventLabel: `Seller updated: ${data.name}`,
    },
  });

  revalidatePath("/sellers");
  revalidatePath(`/sellers/${existing.id}`);
  redirect(`/sellers/${existing.id}`);
}

/**
 * Set a seller's outreach status directly from the seller record — the qualify control that makes the
 * seller → QUALIFIED → promote path usable without detouring through the Contacts workspace. Updates
 * ONLY outreachStatus (unlike the full contact-ops form), so it can't clobber the seller's other
 * contact fields. Gated by UPDATE SELLER.
 */
export async function setSellerOutreachStatus(id: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  // The control only renders for UPDATE-SELLER users over a controlled <select>, so denial/invalid are
  // unreachable via the UI — guard defensively and no-op rather than surface an error.
  if (!(await checkAuthorized(user, "UPDATE", "SELLER", { targetId: id, sellerId: id }))) return;
  const next = String(formData.get("outreachStatus") ?? "").trim();
  if (!isOutreachStatus(next)) return;

  const existing = await prisma.seller.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, name: true, outreachStatus: true },
  });
  if (!existing) return;

  if (existing.outreachStatus !== next) {
    await prisma.seller.update({ where: { id: existing.id }, data: { outreachStatus: next } });
    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        sellerId: existing.id,
        actorId: user.id,
        eventType: "seller.outreach_status_changed",
        eventLabel: `Outreach status: ${outreachStatusLabel(existing.outreachStatus)} → ${outreachStatusLabel(next)}`,
      },
    });
  }

  revalidatePath(`/sellers/${existing.id}`);
  revalidatePath("/sellers");
}

export async function deleteSeller(id: string) {
  const user = await requireUser();
  await authorize(user, "DELETE", "SELLER", { targetId: id, sellerId: id });

  const existing = await prisma.seller.findFirst({
    where: { id, organizationId: user.organizationId },
  });

  if (!existing) {
    redirect("/sellers");
  }

  await prisma.seller.delete({ where: { id: existing.id } });

  // The activity log's sellerId is set to null on delete; keep a record of the event.
  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "seller.deleted",
      eventLabel: `Seller deleted: ${existing.name}`,
    },
  });

  revalidatePath("/sellers");
  revalidatePath("/dashboard");
  redirect("/sellers");
}
