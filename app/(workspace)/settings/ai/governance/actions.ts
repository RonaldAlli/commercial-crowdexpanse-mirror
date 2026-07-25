"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { recordAiAudit } from "@/lib/ai/audit";

export type GovernanceState = { ok?: boolean; error?: string; message?: string } | undefined;

const s = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

async function currentOrNew(organizationId: string) {
  const existing = await prisma.aiGovernanceApproval.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return existing?.id ?? null;
}

/** Create or update the org's governance record (details + move to DRAFT/PENDING_APPROVAL). */
export async function saveGovernance(formData: FormData): Promise<GovernanceState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) return { error: GENERIC_DENIAL };

  const submit = formData.get("submitForApproval") === "on";
  const data = {
    pilotScope: s(formData, "pilotScope"),
    approvedDataClasses: s(formData, "approvedDataClasses"),
    excludedDataClasses: s(formData, "excludedDataClasses"),
    maskingPolicyVersion: s(formData, "maskingPolicyVersion"),
    zdrDecision: s(formData, "zdrDecision"),
    anthropicAccount: s(formData, "anthropicAccount"),
    approvedModel: s(formData, "approvedModel"),
    notes: s(formData, "notes"),
    status: (submit ? "PENDING_APPROVAL" : "DRAFT") as "PENDING_APPROVAL" | "DRAFT",
  };
  const id = await currentOrNew(actor.organizationId);
  if (id) await prisma.aiGovernanceApproval.update({ where: { id }, data });
  else await prisma.aiGovernanceApproval.create({ data: { organizationId: actor.organizationId, ...data } });

  await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: submit ? "ai.governance.submitted" : "ai.governance.saved", detail: `status=${data.status}` });
  revalidatePath("/settings/ai/governance");
  revalidatePath("/settings/ai/release");
  return { ok: true, message: submit ? "Submitted for approval." : "Governance draft saved." };
}

/** Approve / reject / revoke the current governance record. APPROVED unlocks live traffic. */
export async function decideGovernance(formData: FormData): Promise<GovernanceState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) return { error: GENERIC_DENIAL };

  const decision = formData.get("decision");
  if (decision !== "APPROVED" && decision !== "REJECTED" && decision !== "REVOKED") return { error: "Invalid decision." };
  const approver = s(formData, "approver");
  if (decision === "APPROVED" && !approver) return { error: "Approver name is required to approve." };

  const id = await currentOrNew(actor.organizationId);
  if (!id) return { error: "No governance record to decide — save the details first." };

  await prisma.aiGovernanceApproval.update({
    where: { id },
    data: {
      status: decision,
      approver: decision === "APPROVED" ? approver : undefined,
      approvalDate: decision === "APPROVED" ? new Date() : undefined,
      notes: s(formData, "notes") ?? undefined,
    },
  });
  // Immutable audit entry on every status change.
  await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: `ai.governance.${String(decision).toLowerCase()}`, detail: `by=${approver ?? actor.email}` });
  revalidatePath("/settings/ai/governance");
  revalidatePath("/settings/ai/release");
  revalidatePath("/acquire");
  return { ok: true, message: `Governance ${String(decision).toLowerCase()}.` };
}

const back = (r: GovernanceState) => redirect(`/settings/ai/governance?msg=${encodeURIComponent(r?.error ?? r?.message ?? "")}`);
export async function saveGovernanceForm(fd: FormData): Promise<void> { back(await saveGovernance(fd)); }
export async function decideGovernanceForm(fd: FormData): Promise<void> { back(await decideGovernance(fd)); }
