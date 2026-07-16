// Assignment-agreement generation SERVICE (v1.4 Slice 4, AS-15). Documents-owned orchestration
// mirroring the offer-memo service (CC-F): it reads ONLY operational deal data (opportunity +
// property + the assignment record's resolved parties + fee), maps it to the pure input,
// assembles the canonical snapshot, renders deterministic bytes, hashes them, and persists an
// append-only, immutable GENERATED Document. It performs NO calculation and NEVER reads the
// underwriting engine (AS-10/AS-14). The failure-safe order (like OM-L) writes the FILE before
// the row and compensates on failure. The append-only generationSequence is scoped per
// Opportunity via sourceOpportunityId (AS-E/AS-8), leaving the offer-memo path untouched.
// Lifecycle gating (draft only until executed, AS-L) lives in lib/assignment-service; this
// service just produces the artifact. Authorization is the caller's responsibility.
import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildStorageKey, persistFile, removeFile } from "@/lib/storage";
import {
  assembleAssignmentAgreementSnapshot,
  renderAssignmentAgreementHtml,
  ASSIGNMENT_AGREEMENT_GENERATOR_VERSION,
  ASSIGNMENT_AGREEMENT_SNAPSHOT_SCHEMA_VERSION,
  ASSIGNMENT_AGREEMENT_TEMPLATE_VERSION,
  type AssignmentAgreementInput,
} from "./assignment-agreement";

const AGREEMENT_MIME = "text/html; charset=utf-8";

/** SHA-256 of the final stored bytes — the agreement's authoritative historical evidence. */
export function sha256Hex(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Resolve each party's effective name + contact (AS-C hybrid): a free-text override wins;
 * otherwise fall back to the linked Seller/Buyer. Reads only operational entities.
 */
async function resolveParties(
  organizationId: string,
  record: {
    assignorSellerId: string | null;
    assignorName: string | null;
    assignorContact: string | null;
    assigneeBuyerId: string | null;
    assigneeName: string | null;
    assigneeContact: string | null;
  },
): Promise<{ assignor: { name: string | null; contact: string | null }; assignee: { name: string | null; contact: string | null } }> {
  const [seller, buyer] = await Promise.all([
    record.assignorSellerId
      ? prisma.seller.findFirst({ where: { id: record.assignorSellerId, organizationId }, select: { name: true, email: true, phone: true } })
      : Promise.resolve(null),
    record.assigneeBuyerId
      ? prisma.buyer.findFirst({ where: { id: record.assigneeBuyerId, organizationId }, select: { name: true, email: true, phone: true } })
      : Promise.resolve(null),
  ]);
  const trimmed = (s: string | null | undefined) => {
    const t = s?.trim();
    return t ? t : null;
  };
  return {
    assignor: {
      name: trimmed(record.assignorName) ?? seller?.name ?? null,
      contact: trimmed(record.assignorContact) ?? trimmed(seller?.email) ?? trimmed(seller?.phone) ?? null,
    },
    assignee: {
      name: trimmed(record.assigneeName) ?? buyer?.name ?? null,
      contact: trimmed(record.assigneeContact) ?? trimmed(buyer?.email) ?? trimmed(buyer?.phone) ?? null,
    },
  };
}

export type GeneratedAgreement = { id: string; generationSequence: number; contentSha256: string };

/**
 * Generate an assignment agreement from the opportunity's current operational data and persist
 * it as an append-only, immutable GENERATED Document (AS-15). No calculation, no underwriting
 * read. Throws fail-closed if the opportunity or its assignment record is missing. Authorization
 * (CLOSING write) is the caller's responsibility.
 */
export async function generateAssignmentAgreement(
  organizationId: string,
  opportunityId: string,
  actor: { id: string; display: string },
): Promise<GeneratedAgreement> {
  // 1) Read the operational bundle (opportunity + property) scoped to the org.
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId },
    select: {
      id: true,
      title: true,
      contractValueUsd: true,
      assignmentFeeUsd: true,
      property: { select: { id: true, name: true, assetType: true, addressLine1: true, city: true, state: true, postalCode: true, county: true } },
    },
  });
  if (!opportunity) throw new Error("Opportunity not found");

  const record = await prisma.assignmentRecord.findFirst({
    where: { opportunityId, organizationId },
    select: {
      assignorSellerId: true,
      assignorName: true,
      assignorContact: true,
      assigneeBuyerId: true,
      assigneeName: true,
      assigneeContact: true,
    },
  });
  if (!record) throw new Error("Assignment record not found");

  const parties = await resolveParties(organizationId, record);

  // 2) Map to the pure input (operational data only).
  const input: AssignmentAgreementInput = {
    opportunity: {
      id: opportunity.id,
      title: opportunity.title,
      contractValueUsd: opportunity.contractValueUsd,
      assignmentFeeUsd: opportunity.assignmentFeeUsd,
    },
    property: {
      name: opportunity.property.name,
      assetType: opportunity.property.assetType,
      addressLine1: opportunity.property.addressLine1,
      city: opportunity.property.city,
      state: opportunity.property.state,
      postalCode: opportunity.property.postalCode,
      county: opportunity.property.county,
    },
    assignor: parties.assignor,
    assignee: parties.assignee,
  };

  // 3) Assemble the canonical snapshot — the ONLY clock read is here (AS-15 determinism).
  const generatedAtIso = new Date().toISOString();
  const snapshot = assembleAssignmentAgreementSnapshot(input, {
    generatedAtIso,
    generatedById: actor.id,
    generatedByDisplay: actor.display,
  });

  // 4) Render deterministic bytes + hash them, all in memory.
  const bytes = Buffer.from(renderAssignmentAgreementHtml(snapshot), "utf-8");
  const contentSha256 = sha256Hex(bytes);

  // 5) Allocate the final key and write the FILE FIRST (file-first ordering).
  const storageKey = buildStorageKey(organizationId, "assignment-agreement.html");
  await persistFile(storageKey, bytes);

  // 6) Reserve the per-opportunity sequence and create the row in one transaction; compensate.
  let doc: GeneratedAgreement;
  try {
    doc = await prisma.$transaction(async (tx) => {
      const max = await tx.document.aggregate({
        where: { sourceOpportunityId: opportunityId, documentType: "ASSIGNMENT_AGREEMENT" },
        _max: { generationSequence: true },
      });
      const generationSequence = (max._max.generationSequence ?? 0) + 1;
      const created = await tx.document.create({
        data: {
          organizationId,
          opportunityId: opportunity.id,
          propertyId: opportunity.property.id,
          title: `Assignment agreement — ${opportunity.property.name} (#${generationSequence})`,
          documentType: "ASSIGNMENT_AGREEMENT",
          storageKey,
          originalFilename: `assignment-agreement-${generationSequence}.html`,
          mimeType: AGREEMENT_MIME,
          fileSizeBytes: bytes.length,
          origin: "GENERATED",
          sourceOpportunityId: opportunityId,
          templateVersion: ASSIGNMENT_AGREEMENT_TEMPLATE_VERSION,
          generatorVersion: ASSIGNMENT_AGREEMENT_GENERATOR_VERSION,
          snapshotSchemaVersion: ASSIGNMENT_AGREEMENT_SNAPSHOT_SCHEMA_VERSION,
          contentSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          contentSha256,
          generatedById: actor.id,
          generatedAt: new Date(generatedAtIso),
          generationSequence,
        },
        select: { id: true, generationSequence: true, contentSha256: true },
      });
      return { id: created.id, generationSequence: created.generationSequence!, contentSha256: created.contentSha256! };
    });
  } catch (err) {
    // No row was committed — remove the orphaned file so nothing untracked remains.
    await removeFile(storageKey).catch(() => {});
    throw err;
  }

  // 7) Audit only after BOTH the row and the artifact exist.
  await prisma.activityLog
    .create({
      data: {
        organizationId,
        actorId: actor.id,
        opportunityId: opportunity.id,
        propertyId: opportunity.property.id,
        eventType: "assignment_agreement.generated",
        eventLabel: `Assignment agreement generated by ${actor.display}`,
        eventBody: `${opportunity.property.name} · draft #${doc.generationSequence}`,
      },
    })
    .catch(() => {});

  return doc;
}

/** List an opportunity's generated assignment agreements, newest draft first (AS-M). */
export async function listGeneratedAgreements(organizationId: string, opportunityId: string) {
  return prisma.document.findMany({
    where: { organizationId, sourceOpportunityId: opportunityId, documentType: "ASSIGNMENT_AGREEMENT", origin: "GENERATED" },
    orderBy: { generationSequence: "desc" },
    select: { id: true, generationSequence: true, generatedAt: true, contentSha256: true, originalFilename: true },
  });
}
