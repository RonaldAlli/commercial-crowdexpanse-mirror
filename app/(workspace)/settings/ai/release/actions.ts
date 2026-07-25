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

// ── Step 5/6: Validation Runner + controlled deployment workflow ─────────────
import { runValidationPipeline } from "@/lib/ai/validation-runner";

/** Run the controlled (read-only, in-process) validation pipeline and store the run. */
export async function runValidation(): Promise<ReleaseState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) return { error: GENERIC_DENIAL };
  const result = await runValidationPipeline(actor.organizationId);
  await prisma.aiValidationRun.create({
    data: {
      organizationId: actor.organizationId,
      createdByUserId: actor.id,
      recommendation: result.recommendation,
      resultsJson: JSON.stringify({ automated: result.automated, browser: result.browser, liveProvider: result.liveProvider, steps: result.steps }),
    },
  });
  await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: "ai.validation.run", detail: `recommendation=${result.recommendation}` });
  revalidatePath("/settings/ai/release");
  return { ok: true, message: `Validation run: ${result.recommendation}.` };
}

// Predefined deployment operations only — NO arbitrary shell, NO auto-deploy to the
// sentinel-marked production instance. Deploy/Rollback GATE + AUDIT + surface the exact
// fixed D25 command for the operator to execute; they never execute against prod here.
async function mandatoryGatesPass(orgId: string): Promise<{ ok: boolean; reason?: string }> {
  const [cfg, gov, rel] = await Promise.all([
    prisma.aiProviderConfig.findUnique({ where: { organizationId: orgId }, select: { apiKeyEnc: true, model: true, approvedModels: true } }),
    prisma.aiGovernanceApproval.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, select: { status: true } }),
    prisma.aiReleaseApproval.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, select: { decision: true } }),
  ]);
  if (gov?.status !== "APPROVED") return { ok: false, reason: "governance not APPROVED" };
  if (!cfg?.apiKeyEnc) return { ok: false, reason: "no API key configured" };
  if (!cfg.model || !cfg.approvedModels.includes(cfg.model)) return { ok: false, reason: "model not configured/allowlisted" };
  if (rel?.decision !== "APPROVED") return { ok: false, reason: "release not APPROVED" };
  return { ok: true };
}

export async function deploymentDeploy(): Promise<ReleaseState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) return { error: GENERIC_DENIAL };
  const gate = await mandatoryGatesPass(actor.organizationId);
  if (!gate.ok) return { error: `Deploy blocked: ${gate.reason}.` };
  // Gated + audited intent only. The app must NOT deploy to the sentinel-marked prod.
  await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: "ai.deploy.authorized", detail: "gates pass; operator to run D25" });
  return { ok: true, message: "All gates pass. Operator: deploy via D25 — node scripts/deploy/deploy.mjs --app-dir /opt/crowdexpanse/commercial --production --yes (sentinel-confirmed)." };
}

export async function deploymentRollback(): Promise<ReleaseState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) return { error: GENERIC_DENIAL };
  await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: "ai.rollback.requested", detail: "operator to run D25 recover / kill switch" });
  return { ok: true, message: "Rollback: kill switch = revoke key + restart (in AI settings); code = node scripts/deploy/deploy.mjs --recover --app-dir /opt/crowdexpanse/commercial." };
}

export async function runValidationForm(): Promise<void> { back(await runValidation()); }
export async function deploymentDeployForm(): Promise<void> { back(await deploymentDeploy()); }
export async function deploymentRollbackForm(): Promise<void> { back(await deploymentRollback()); }
