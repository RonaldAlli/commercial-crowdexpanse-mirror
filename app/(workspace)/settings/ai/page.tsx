import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveCopilotStatus } from "@/lib/ai/runtime-config";
import { aiEncryptionReady } from "@/lib/ai/config-secret";
import { saveAiSettingsForm, revokeAiKeyForm, testAiConfigurationForm } from "./actions";

export const dynamic = "force-dynamic";

/** AI provider administration. ADMIN-only. The API key is AES-256-GCM encrypted at rest and NEVER
 *  returned to the browser — only whether one is configured and its last 4 characters are shown. */
export default async function AiSettingsPage({ searchParams }: { searchParams: { msg?: string } }) {
  const user = await requireRole(UserRole.ADMIN);
  const cfg = await prisma.aiProviderConfig.findUnique({ where: { organizationId: user.organizationId } });
  const status = await resolveCopilotStatus(user.organizationId);
  const gov = await prisma.aiGovernanceApproval.findFirst({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, select: { status: true } });
  const audit = await prisma.aiAdminAuditEvent.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 10, select: { action: true, detail: true, createdAt: true } });
  const encReady = aiEncryptionReady();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="AI provider" description="Configure the Anthropic provider for the Workspace AI Copilot. The API key is encrypted at rest and never shown." />
      {searchParams.msg ? <div className="card p-3 text-sm text-slate-700">{searchParams.msg}</div> : null}

      <div className="card max-w-2xl space-y-2 p-6 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Effective status</span><span className={status.configured ? "font-semibold text-emerald-600" : "font-semibold text-slate-700"}>{status.configured ? `configured (${status.source})` : "not configured"}</span></div>
        {!status.configured && status.reason ? <div className="text-slate-500">Reason: {status.reason}</div> : null}
        <div className="flex justify-between"><span className="text-slate-500">Encryption key (AI_CONFIG_ENCRYPTION_KEY)</span><span className={encReady ? "text-emerald-600" : "text-rose-600"}>{encReady ? "present" : "MISSING — set on the host"}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Stored API key</span><span>{cfg?.apiKeyLast4 ? `configured ••••${cfg.apiKeyLast4}` : "none"}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Governance</span><span>{gov?.status ?? "none"} {gov?.status === "APPROVED" ? "" : "(live traffic blocked until APPROVED)"}</span></div>
        <div className="pt-1 text-xs text-slate-400">Governance → <a className="underline" href="/settings/ai/governance">manage</a> · Release readiness → <a className="underline" href="/settings/ai/release">dashboard</a></div>
      </div>

      <form action={saveAiSettingsForm} className="card max-w-2xl space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-800">Provider configuration</h2>
        <label className="block text-sm">Provider<input className="input mt-1" value="Anthropic" disabled /></label>
        <label className="block text-sm">Model<input name="model" defaultValue={cfg?.model ?? ""} placeholder="claude-sonnet-5" className="input mt-1" /></label>
        <label className="block text-sm">Approved model allowlist (comma-separated)<input name="approvedModels" defaultValue={cfg?.approvedModels.join(", ") ?? ""} placeholder="claude-opus-4-8, claude-sonnet-5" className="input mt-1" /></label>
        <label className="block text-sm">Request timeout (ms, optional)<input name="timeoutMs" type="number" min="1" defaultValue={cfg?.timeoutMs ?? ""} placeholder="60000" className="input mt-1" /></label>
        <label className="block text-sm">Environment target<select name="envTarget" defaultValue={cfg?.envTarget ?? "VALIDATION"} className="input mt-1"><option value="VALIDATION">validation</option><option value="PRODUCTION">production</option></select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={cfg?.enabled ?? false} /> Enable AI for this organization</label>
        <hr className="border-slate-100" />
        <label className="block text-sm">New API key (leave blank to keep existing)<input name="apiKey" type="password" autoComplete="new-password" placeholder="sk-ant-…" className="input mt-1" /></label>
        <label className="block text-sm">Confirm your password (required to change the key)<input name="confirmPassword" type="password" autoComplete="current-password" className="input mt-1" /></label>
        <button type="submit" className="btn-primary">Save AI settings</button>
      </form>

      <div className="card max-w-2xl space-y-3 p-6">
        <h2 className="text-sm font-semibold text-slate-800">Test &amp; revoke</h2>
        <form action={testAiConfigurationForm}><button type="submit" className="btn-secondary">Test configuration (sends a fixed prompt — no customer data)</button></form>
        <form action={revokeAiKeyForm} className="flex items-end gap-2">
          <label className="block text-sm flex-1">Confirm password to revoke<input name="confirmPassword" type="password" autoComplete="current-password" className="input mt-1" /></label>
          <button type="submit" className="btn-danger">Revoke key &amp; disable</button>
        </form>
      </div>

      <div className="card max-w-2xl p-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Recent audit</h2>
        <ul className="space-y-1 text-xs text-slate-500">
          {audit.length === 0 ? <li>No audit events yet.</li> : audit.map((a, i) => (
            <li key={i} className="flex justify-between gap-2"><span className="font-mono">{a.action}</span><span className="min-w-0 flex-1 truncate text-slate-400">{a.detail}</span><span>{a.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
