"use server";

import { ContactMethod, ContactOutreachStatus, ContactTouchType, UserLifecycleState } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/authorize";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeInternalPath } from "@/lib/safe-redirect";

export type ContactKind = "owner" | "seller" | "buyer";

const OUTREACH_STATUSES = new Set<string>(Object.values(ContactOutreachStatus));
const CONTACT_METHODS = new Set<string>(Object.values(ContactMethod));
const TOUCH_TYPES = new Set<string>(Object.values(ContactTouchType));

function parseEnumValue<T extends string>(raw: string, allowed: Set<string>, fallback: T): T {
  return (allowed.has(raw) ? raw : fallback) as T;
}

function parseDate(raw: string) {
  if (!raw) return null;
  const value = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function parseOpsForm(formData: FormData) {
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    outreachStatus: parseEnumValue<ContactOutreachStatus>(value("outreachStatus"), OUTREACH_STATUSES, ContactOutreachStatus.NEW),
    preferredContactMethod: value("preferredContactMethod")
      ? parseEnumValue<ContactMethod>(value("preferredContactMethod"), CONTACT_METHODS, ContactMethod.CALL)
      : null,
    nextFollowUpAt: parseDate(value("nextFollowUpAt")),
    assignedUserId: value("assignedUserId") || null,
    doNotCall: String(formData.get("doNotCall") ?? "") === "true",
    doNotEmail: String(formData.get("doNotEmail") ?? "") === "true",
    doNotText: String(formData.get("doNotText") ?? "") === "true",
    badPhone: String(formData.get("badPhone") ?? "") === "true",
    badEmail: String(formData.get("badEmail") ?? "") === "true",
  };
}

function parseTouchForm(formData: FormData) {
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    type: parseEnumValue<ContactTouchType>(value("type"), TOUCH_TYPES, ContactTouchType.NOTE),
    summary: value("summary") || null,
    nextFollowUpAt: parseDate(value("nextFollowUpAt")),
  };
}

async function validateAssignedUser(organizationId: string, assignedUserId: string | null) {
  if (!assignedUserId) return null;
  const member = await prisma.user.findFirst({
    where: { id: assignedUserId, organizationId, lifecycleState: UserLifecycleState.ACTIVE },
    select: { id: true },
  });
  return member?.id ?? null;
}

async function authorizeKind(kind: ContactKind, id: string) {
  const user = await requireUser();
  if (kind === "owner") {
    await authorize(user, "UPDATE", "OWNER", { targetId: id });
  } else if (kind === "seller") {
    await authorize(user, "UPDATE", "SELLER", { targetId: id, sellerId: id });
  } else {
    await authorize(user, "UPDATE", "BUYER", { targetId: id, buyerId: id });
  }
  return user;
}

function buildFallback(kind: ContactKind, id: string) {
  return `/contacts/${kind}/${id}`;
}

export async function updateContactOpsAction(kind: ContactKind, id: string, formData: FormData) {
  const user = await authorizeKind(kind, id);
  const redirectTo = safeInternalPath(formData.get("redirectTo"), buildFallback(kind, id));
  const data = parseOpsForm(formData);
  const assignedUserId = await validateAssignedUser(user.organizationId, data.assignedUserId);

  if (kind === "owner") {
    const existing = await prisma.ownerContact.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { owner: { select: { id: true, displayName: true } } },
    });
    if (!existing) redirect("/contacts");

    await prisma.ownerContact.update({
      where: { id: existing.id },
      data: {
        outreachStatus: data.outreachStatus,
        preferredContactMethod: data.preferredContactMethod,
        nextFollowUpAt: data.nextFollowUpAt,
        assignedUserId,
        doNotCall: data.doNotCall,
        doNotEmail: data.doNotEmail,
        doNotText: data.doNotText,
        badPhone: data.badPhone,
        badEmail: data.badEmail,
      },
    });

    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        eventType: "contact.ops_updated",
        eventLabel: `Contact workspace updated: ${existing.owner.displayName}`,
        eventBody: JSON.stringify({ kind, ownerContactId: existing.id, ownerId: existing.ownerId }),
      },
    });

    revalidatePath(`/owners/${existing.ownerId}`);
  } else if (kind === "seller") {
    const existing = await prisma.seller.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!existing) redirect("/contacts");

    await prisma.seller.update({
      where: { id: existing.id },
      data: {
        outreachStatus: data.outreachStatus,
        preferredContactMethod: data.preferredContactMethod,
        nextFollowUpAt: data.nextFollowUpAt,
        assignedUserId,
        doNotCall: data.doNotCall,
        doNotEmail: data.doNotEmail,
        doNotText: data.doNotText,
        badPhone: data.badPhone,
        badEmail: data.badEmail,
      },
    });

    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        sellerId: existing.id,
        eventType: "contact.ops_updated",
        eventLabel: `Contact workspace updated: ${existing.name}`,
        eventBody: JSON.stringify({ kind, sellerId: existing.id }),
      },
    });

    revalidatePath(`/sellers/${existing.id}`);
  } else {
    const existing = await prisma.buyer.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!existing) redirect("/contacts");

    await prisma.buyer.update({
      where: { id: existing.id },
      data: {
        outreachStatus: data.outreachStatus,
        preferredContactMethod: data.preferredContactMethod,
        nextFollowUpAt: data.nextFollowUpAt,
        assignedUserId,
        doNotCall: data.doNotCall,
        doNotEmail: data.doNotEmail,
        doNotText: data.doNotText,
        badPhone: data.badPhone,
        badEmail: data.badEmail,
      },
    });

    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        buyerId: existing.id,
        eventType: "contact.ops_updated",
        eventLabel: `Contact workspace updated: ${existing.name}`,
        eventBody: JSON.stringify({ kind, buyerId: existing.id }),
      },
    });

    revalidatePath(`/buyers/${existing.id}`);
  }

  revalidatePath("/contacts");
  revalidatePath(buildFallback(kind, id));
  redirect(redirectTo);
}

export async function logContactTouchAction(kind: ContactKind, id: string, formData: FormData) {
  const user = await authorizeKind(kind, id);
  const redirectTo = safeInternalPath(formData.get("redirectTo"), buildFallback(kind, id));
  const data = parseTouchForm(formData);

  if (kind === "owner") {
    const existing = await prisma.ownerContact.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { owner: { select: { id: true, displayName: true } } },
    });
    if (!existing) redirect("/contacts");

    await prisma.$transaction(async (tx) => {
      await tx.contactTouch.create({
        data: {
          organizationId: user.organizationId,
          ownerContactId: existing.id,
          type: data.type,
          summary: data.summary,
          createdById: user.id,
        },
      });
      if (data.nextFollowUpAt !== undefined) {
        await tx.ownerContact.update({
          where: { id: existing.id },
          data: { nextFollowUpAt: data.nextFollowUpAt },
        });
      }
    });

    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        eventType: "contact.touch_logged",
        eventLabel: `${data.type} logged for ${existing.owner.displayName}`,
        eventBody: JSON.stringify({ kind, ownerContactId: existing.id, ownerId: existing.ownerId, type: data.type, summary: data.summary }),
      },
    });

    revalidatePath(`/owners/${existing.ownerId}`);
  } else if (kind === "seller") {
    const existing = await prisma.seller.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!existing) redirect("/contacts");

    await prisma.$transaction(async (tx) => {
      await tx.contactTouch.create({
        data: {
          organizationId: user.organizationId,
          sellerId: existing.id,
          type: data.type,
          summary: data.summary,
          createdById: user.id,
        },
      });
      if (data.nextFollowUpAt !== undefined) {
        await tx.seller.update({
          where: { id: existing.id },
          data: { nextFollowUpAt: data.nextFollowUpAt },
        });
      }
    });

    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        sellerId: existing.id,
        eventType: "contact.touch_logged",
        eventLabel: `${data.type} logged for ${existing.name}`,
        eventBody: JSON.stringify({ kind, sellerId: existing.id, type: data.type, summary: data.summary }),
      },
    });

    revalidatePath(`/sellers/${existing.id}`);
  } else {
    const existing = await prisma.buyer.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!existing) redirect("/contacts");

    await prisma.$transaction(async (tx) => {
      await tx.contactTouch.create({
        data: {
          organizationId: user.organizationId,
          buyerId: existing.id,
          type: data.type,
          summary: data.summary,
          createdById: user.id,
        },
      });
      if (data.nextFollowUpAt !== undefined) {
        await tx.buyer.update({
          where: { id: existing.id },
          data: { nextFollowUpAt: data.nextFollowUpAt },
        });
      }
    });

    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        buyerId: existing.id,
        eventType: "contact.touch_logged",
        eventLabel: `${data.type} logged for ${existing.name}`,
        eventBody: JSON.stringify({ kind, buyerId: existing.id, type: data.type, summary: data.summary }),
      },
    });

    revalidatePath(`/buyers/${existing.id}`);
  }

  revalidatePath("/contacts");
  revalidatePath(buildFallback(kind, id));
  redirect(redirectTo);
}
