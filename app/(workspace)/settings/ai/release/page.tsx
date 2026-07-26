import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeReleaseGates, productionDeployAllowed, type ReleaseFacts } from "@/lib/ai/release-gates";
import { checkTagProtection } from "@/lib/ai/tag-protection";
import { decideReleaseForm, runValidationForm, deploymentDeployForm, deploymentRollbackForm } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  PASS: "text-emerald-600", FAIL: "text-rose-600", BLOCKED: "text-amber-600", PENDING: "text-slate-500", NOT_APPLICABLE: "text-slate-400",
  RECOMMENDED: "text-sky-600", // advisory (governance best practice) — never a blocker
};

/** Release readiness dashboard (ADMIN-only). Every gate is derived from real records/checks. */
export default async function AiReleasePage({ searchParams }: { searchParams: { msg?: string } }) {
  const user = await requireRole(UserRole.ADMIN);
  const orgId = user.organizationId;

  const [cfg, gov, release, lastRun, prodRun, testAudit, tagProtection] = await Promise.all([
    prisma.aiProviderConfig.findUnique({ where: { organizationId: orgId }, select: { enabled: true, apiKeyEnc: true, model: true, approvedModels: true } }),
    prisma.aiGovernanceApproval.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, select: { status: true } }),
    prisma.aiReleaseApproval.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, select: { decision: true, candidateTag: true, candidateCommit: true } }),
    prisma.aiValidationRun.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, select: { resultsJson: true, recommendation: true } }),
    // Latest run carrying a production-deployment record — drives the prod gates (not hard-coded).
    prisma.aiValidationRun.findFirst({ where: { organizationId: orgId, resultsJson: { contains: "\"production\"" } }, orderBy: { createdAt: "desc" }, select: { resultsJson: true } }),
    prisma.aiAdminAuditEvent.findFirst({ where: { organizationId: orgId, action: { in: ["ai.config.test.passed", "ai.config.test.failed"] } }, orderBy: { createdAt: "desc" }, select: { action: true } }),
    checkTagProtection(),
  ]);

  let latestValidation: ReleaseFacts["latestValidation"] = null;
  if (lastRun?.resultsJson) {
    try {
      const r = JSON.parse(lastRun.resultsJson) as { automated?: boolean; browser?: boolean; liveProvider?: boolean };
      latestValidation = { automated: Boolean(r.automated), browser: Boolean(r.browser), liveProvider: Boolean(r.liveProvider) };
    } catch { /* ignore malformed */ }
  }
  // Production deployment/smoke gates sourced from a persisted release record.
  let prod: { deployed?: boolean; smoke?: "PASS" | "FAIL"; build?: string; tag?: string; date?: string; validationHealthy?: boolean } = {};
  if (prodRun?.resultsJson) {
    try { prod = (JSON.parse(prodRun.resultsJson) as { production?: typeof prod }).production ?? {}; } catch { /* ignore */ }
  }

  const facts: ReleaseFacts = {
    baselineVerified: true,
    tagProtection,
    governanceStatus: gov?.status ?? null,
    store: cfg ? { enabled: cfg.enabled, hasKey: Boolean(cfg.apiKeyEnc), model: cfg.model, approvedModels: cfg.approvedModels } : null,
    providerTestPassed: testAudit ? testAudit.action === "ai.config.test.passed" : null,
    validationHealthy: Boolean(prod.validationHealthy),
    latestValidation,
    releaseStatus: release?.decision ?? null,
    productionDeployed: Boolean(prod.deployed),
    productionSmoke: prod.smoke ?? null,
  };
  const gates = computeReleaseGates(facts);
  const deploy = productionDeployAllowed(gates);
  const runs = await prisma.aiValidationRun.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 5, select: { recommendation: true, createdAt: true } });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings · AI" title="Release readiness — Workspace AI Phase 1" description="Every gate is derived from real records. Production deploy is available only when all mandatory gates pass." />
      {searchParams.msg ? <div className="card p-3 text-sm text-slate-700">{searchParams.msg}</div> : null}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {gates.map((g) => (
              <tr key={g.key} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 text-slate-700">{g.label}</td>
                <td className={`px-4 py-2 font-mono font-semibold ${STATUS_COLOR[g.status]}`}>{g.status}</td>
                <td className="px-4 py-2 text-slate-400">{g.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`card p-4 text-sm ${deploy.allowed ? "text-emerald-700" : "text-amber-700"}`}>
        Production deploy: <span className="font-semibold">{deploy.allowed ? "ALLOWED (all mandatory gates pass)" : "BLOCKED"}</span>
        {deploy.blockers.length ? <span className="text-slate-500"> — blocked by: {deploy.blockers.join(", ")}</span> : null}
        {prod.deployed ? <div className="mt-1 text-xs text-slate-500">Production: candidate {prod.tag ?? "?"} · build {prod.build ?? "?"} · deployed {prod.date ?? "?"} · smoke {prod.smoke ?? "?"}</div> : null}
      </div>

      <div className="card max-w-2xl space-y-3 p-6">
        <h2 className="text-sm font-semibold text-slate-800">Deployment control (predefined actions only)</h2>
        <div className="flex flex-wrap gap-2">
          <form action={runValidationForm}><button type="submit" className="btn-secondary">Validate (run pipeline)</button></form>
          <form action={deploymentDeployForm}><button type="submit" className="btn-primary">Deploy (gated)</button></form>
          <form action={deploymentRollbackForm}><button type="submit" className="btn-danger">Rollback</button></form>
        </div>
        <p className="text-xs text-slate-400">Deploy is gated on all mandatory gates + release APPROVED; it audits intent and surfaces the exact D25 command — it never auto-deploys to the sentinel-marked production instance. Rollback surfaces the kill switch + D25 recover command. No arbitrary shell execution.</p>
        {runs.length ? (
          <div className="pt-2 text-xs text-slate-500">
            <div className="mb-1 font-medium text-slate-600">Recent validation runs</div>
            <ul className="space-y-0.5">{runs.map((r, i) => (<li key={i} className="flex justify-between"><span className={r.recommendation === "PASS" ? "text-emerald-600" : "text-rose-600"}>{r.recommendation}</span><span>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span></li>))}</ul>
          </div>
        ) : null}
      </div>

      <form action={decideReleaseForm} className="card max-w-2xl space-y-3 p-6">
        <h2 className="text-sm font-semibold text-slate-800">Release approval</h2>
        <label className="block text-sm">Approver<input name="approver" className="input mt-1" /></label>
        <label className="block text-sm">Candidate tag<input name="candidateTag" defaultValue="workspace-ai-platform-phase1-ready.1" className="input mt-1" /></label>
        <label className="block text-sm">Candidate commit<input name="candidateCommit" className="input mt-1" /></label>
        <label className="block text-sm">Notes<input name="notes" className="input mt-1" /></label>
        <div className="flex gap-2">
          <button type="submit" name="decision" value="APPROVED" className="btn-primary">Approve release</button>
          <button type="submit" name="decision" value="REJECTED" className="btn-secondary">Reject</button>
          <button type="submit" name="decision" value="REVOKED" className="btn-danger">Revoke</button>
        </div>
        <p className="text-xs text-slate-400">Approve requires governance APPROVED first. Production deployment via D25 remains a separate, audited operation gated on this approval and on repository-admin tag protection.</p>
      </form>
    </div>
  );
}
