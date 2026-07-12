"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authorize } from "@/lib/authorize";
import { NOTE_LINK_META, type NoteLinkType } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";

export type NoteFormState = { error?: string } | undefined;

type Links = { sellerId: string | null; buyerId: string | null; propertyId: string | null; opportunityId: string | null };

const EMPTY_LINKS: Links = { sellerId: null, buyerId: null, propertyId: null, opportunityId: null };

/** Validate body + the single chosen link, scoped to the caller's org. */
async function buildPayload(formData: FormData, organizationId: string) {
  const str = (key: string) => String(formData.get(key) ?? "").trim();

  const body = str("body");
  if (!body) return { error: "Note body is required." } as const;

  const linkType = str("linkType") as NoteLinkType;
  const meta = NOTE_LINK_META[linkType];
  if (!meta) return { error: "Choose what this note is about." } as const;

  const linkId = str(meta.field);
  if (!linkId) return { error: `Select a ${meta.label.toLowerCase()} to link.` } as const;

  const where = { id: linkId, organizationId };
  let record: { id: string } | null = null;
  switch (linkType) {
    case "seller":
      record = await prisma.seller.findFirst({ where, select: { id: true } });
      break;
    case "buyer":
      record = await prisma.buyer.findFirst({ where, select: { id: true } });
      break;
    case "property":
      record = await prisma.property.findFirst({ where, select: { id: true } });
      break;
    case "opportunity":
      record = await prisma.opportunity.findFirst({ where, select: { id: true } });
      break;
  }
  if (!record) return { error: `Selected ${meta.label.toLowerCase()} was not found in your organization.` } as const;

  const links: Links = { ...EMPTY_LINKS, [meta.field]: record.id };
  return { body, links, linkType } as const;
}

export async function createNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const user = await requireUser();
  const result = await buildPayload(formData, user.organizationId);
  if ("error" in result) return { error: result.error };

  await prisma.note.create({
    data: {
      organizationId: user.organizationId,
      authorId: user.id,
      body: result.body,
      ...result.links,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      ...result.links,
      eventType: "note.created",
      eventLabel: `Note added by ${user.name}`,
      eventBody: result.body.slice(0, 140),
    },
  });

  revalidatePath("/notes");
  redirect("/notes");
}

export async function updateNote(id: string, _prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const user = await requireUser();

  const existing = await prisma.note.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!existing) return { error: "Note not found." };

  const result = await buildPayload(formData, user.organizationId);
  if ("error" in result) return { error: result.error };

  await prisma.note.update({
    where: { id: existing.id },
    data: { body: result.body, ...result.links },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      ...result.links,
      eventType: "note.updated",
      eventLabel: `Note updated by ${user.name}`,
      eventBody: result.body.slice(0, 140),
    },
  });

  revalidatePath("/notes");
  redirect("/notes");
}

export async function deleteNote(id: string) {
  const user = await requireUser();
  await authorize(user, "DELETE", "NOTE", { targetId: id });

  const existing = await prisma.note.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    redirect("/notes");
  }

  await prisma.note.delete({ where: { id: existing.id } });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      sellerId: existing.sellerId,
      buyerId: existing.buyerId,
      propertyId: existing.propertyId,
      opportunityId: existing.opportunityId,
      eventType: "note.deleted",
      eventLabel: `Note deleted by ${user.name}`,
    },
  });

  revalidatePath("/notes");
  redirect("/notes");
}
