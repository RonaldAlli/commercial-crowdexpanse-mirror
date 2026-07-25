"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { recordAiAudit } from "@/lib/ai/audit";

export type ReleaseState = { ok?: boolean; error?: string; message?: string } | undefined;

const s = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

/** Record a release decision. APPROVED requires governance APPROVED first (fail-closed). */
export async function decideRelease(formData: FormData): Promise<ReleaseState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) return { error: GENERIC_DENIAL };

  const decision = formData.get("decision");
  if (decision !== "APPROVED" && decision !== "REJECTED" && decision !== "REVOKED") return { error: "Invalid decision." };

  if (decision === "APPROVED") {
    const gov = await prisma.aiGovernanceApproval.findFirst({ where: { organizationId: actor.organizationId }, orderBy: { createdAt: "desc" }, select: { status: true, id: true } });
    if (gov?.status !== "APPROVED") return { error: "Governance must be APPROVED before release can be approved." };
  }

  const gov = await prisma.aiGovernanceApproval.findFirst({ where: { organizationId: actor.organizationId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  await prisma.aiReleaseApproval.create({
    data: {
      organizationId: actor.organizationId,
      approver: s(formData, "approver"),
      candidateTag: s(formData, "candidateTag"),
      candidateCommit: s(formData, "candidateCommit"),
      validationRunId: s(formData, "validationRunId"),
      governanceApprovalId: gov?.id ?? null,
      decision,
      notes: s(formData, "notes"),
    },
  });
  await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: `ai.release.${String(decision).toLowerCase()}`, detail: `tag=${s(formData, "candidateTag") ?? "-"}` });
  revalidatePath("/settings/ai/release");
  return { ok: true, message: `Release ${String(decision).toLowerCase()}.` };
}

const back = (r: ReleaseState) => redirect(`/settings/ai/release?msg=${encodeURIComponent(r?.error ?? r?.message ?? "")}`);
export async function decideReleaseForm(fd: FormData): Promise<void> { back(await decideRelease(fd)); }
