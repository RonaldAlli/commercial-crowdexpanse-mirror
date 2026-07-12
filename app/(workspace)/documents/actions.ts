"use server";

import { DocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authorize, checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { NOTE_LINK_META, type NoteLinkType } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";
import { buildStorageKey, MAX_UPLOAD_BYTES, persistFile, removeFile } from "@/lib/storage";

export type DocumentFormState = { error?: string } | undefined;

const VALID_TYPES = new Set<string>(Object.values(DocumentType));

type Links = { sellerId: string | null; buyerId: string | null; propertyId: string | null; opportunityId: string | null };
const EMPTY_LINKS: Links = { sellerId: null, buyerId: null, propertyId: null, opportunityId: null };

/** Validate the chosen document type + single record link, scoped to org. */
async function resolveMeta(formData: FormData, organizationId: string) {
  const str = (key: string) => String(formData.get(key) ?? "").trim();

  const title = str("title");
  const documentType = str("documentType");
  if (!VALID_TYPES.has(documentType)) return { error: "Select a valid document type." } as const;

  const linkType = str("linkType") as NoteLinkType;
  const meta = NOTE_LINK_META[linkType];
  if (!meta) return { error: "Choose what this document is about." } as const;

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
  return { title, documentType: documentType as DocumentType, links } as const;
}

export async function uploadDocument(_prev: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "CREATE", "DOCUMENT"))) return { error: GENERIC_DENIAL };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "File is too large (25MB max)." };
  }

  const meta = await resolveMeta(formData, user.organizationId);
  if ("error" in meta) return { error: meta.error };

  const originalFilename = file.name || "upload";
  const storageKey = buildStorageKey(user.organizationId, originalFilename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await persistFile(storageKey, buffer);

  const document = await prisma.document.create({
    data: {
      organizationId: user.organizationId,
      uploaderId: user.id,
      title: meta.title || originalFilename,
      documentType: meta.documentType,
      storageKey,
      originalFilename,
      mimeType: file.type || null,
      fileSizeBytes: file.size,
      ...meta.links,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      ...meta.links,
      eventType: "document.created",
      eventLabel: `Document uploaded by ${user.name}`,
      eventBody: `${document.title} (${originalFilename})`,
    },
  });

  revalidatePath("/documents");
  redirect("/documents");
}

/** Edit metadata only (title, type, link) — not the file bytes. */
export async function updateDocument(id: string, _prev: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "DOCUMENT", { targetId: id }))) {
    return { error: GENERIC_DENIAL };
  }

  const existing = await prisma.document.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, originalFilename: true },
  });
  if (!existing) return { error: "Document not found." };

  const meta = await resolveMeta(formData, user.organizationId);
  if ("error" in meta) return { error: meta.error };

  const document = await prisma.document.update({
    where: { id: existing.id },
    data: {
      title: meta.title || existing.originalFilename || "Document",
      documentType: meta.documentType,
      ...meta.links,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      ...meta.links,
      eventType: "document.updated",
      eventLabel: `Document updated by ${user.name}`,
      eventBody: document.title,
    },
  });

  revalidatePath("/documents");
  redirect("/documents");
}

export async function deleteDocument(id: string) {
  const user = await requireUser();
  await authorize(user, "DELETE", "DOCUMENT", { targetId: id });

  const existing = await prisma.document.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    redirect("/documents");
  }

  await prisma.document.delete({ where: { id: existing.id } });
  await removeFile(existing.storageKey);

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      sellerId: existing.sellerId,
      buyerId: existing.buyerId,
      propertyId: existing.propertyId,
      opportunityId: existing.opportunityId,
      eventType: "document.deleted",
      eventLabel: `Document deleted by ${user.name}`,
      eventBody: existing.title,
    },
  });

  revalidatePath("/documents");
  redirect("/documents");
}
