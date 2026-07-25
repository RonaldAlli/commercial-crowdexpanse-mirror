// Controlled validation runner. Executes a FIXED, allow-listed sequence of read-only,
// in-process checks — NO shell, NO arbitrary command execution, NO mutation. Produces a
// sanitized result (no secrets) suitable for storing as an AiValidationRun and for the
// release dashboard. Heavier suites (unit/E2E/build) run in the gated CI/deploy pipeline;
// this runner covers what is safely and deterministically verifiable at runtime.

import { prisma } from "@/lib/prisma";
import { aiEncryptionReady } from "./config-secret";
import { resolveCopilotStatus } from "./runtime-config";

export type StepStatus = "PASS" | "FAIL" | "PENDING";
export type ValidationStep = { id: string; label: string; status: StepStatus; detail: string };
export type ValidationResult = {
  recommendation: "PASS" | "FAIL";
  steps: ValidationStep[];
  automated: boolean; // all in-process checks passed
  browser: boolean; // recorded elsewhere (browser pass) — not verifiable in-process
  liveProvider: boolean; // recorded elsewhere (needs authorized key)
};

export async function runValidationPipeline(organizationId: string): Promise<ValidationResult> {
  const steps: ValidationStep[] = [];
  const push = (id: string, label: string, ok: boolean, detail: string) => steps.push({ id, label, status: ok ? "PASS" : "FAIL", detail });

  // 1. Database reachable.
  try {
    await prisma.organization.count({ where: { id: organizationId } });
    push("db", "Database reachable", true, "org query succeeded");
  } catch (e) {
    push("db", "Database reachable", false, (e as Error).message.slice(0, 80));
  }

  // 2. Migration present (querying the new table proves the migration was applied).
  try {
    await prisma.aiProviderConfig.count({ where: { organizationId } });
    push("migration", "AI release-controls migration applied", true, "ai_provider_configs present");
  } catch {
    push("migration", "AI release-controls migration applied", false, "table missing — run prisma migrate deploy");
  }

  // 3. Encryption master key present (fail-closed check).
  push("encryption", "Encryption master key configured", aiEncryptionReady(), aiEncryptionReady() ? "AI_CONFIG_ENCRYPTION_KEY present" : "AI_CONFIG_ENCRYPTION_KEY missing");

  // 4. Effective config status (never includes the key).
  const status = await resolveCopilotStatus(organizationId);
  steps.push({ id: "config", label: "Effective AI configuration", status: status.configured ? "PASS" : "PENDING", detail: status.configured ? `configured (${status.source})` : status.reason ?? "not configured" });

  // 5. Governance status.
  const gov = await prisma.aiGovernanceApproval.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { status: true } });
  steps.push({ id: "governance", label: "Governance status", status: gov?.status === "APPROVED" ? "PASS" : "PENDING", detail: gov?.status ?? "none" });

  const hardFailures = steps.filter((s) => s.status === "FAIL");
  const automated = steps.filter((s) => ["db", "migration", "encryption"].includes(s.id)).every((s) => s.status === "PASS");
  return {
    recommendation: hardFailures.length === 0 ? "PASS" : "FAIL",
    steps,
    automated,
    browser: false,
    liveProvider: false,
  };
}
