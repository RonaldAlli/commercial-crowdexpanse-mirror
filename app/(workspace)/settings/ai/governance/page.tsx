import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveGovernanceForm, decideGovernanceForm } from "./actions";

export const dynamic = "force-dynamic";

/** AI governance workflow (ADMIN-only). Live provider traffic is permitted only when status is APPROVED. */
export default async function AiGovernancePage({ searchParams }: { searchParams: { msg?: string } }) {
  const user = await requireRole(UserRole.ADMIN);
  const g = await prisma.aiGovernanceApproval.findFirst({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings · AI" title="Governance approval" description="Authorize live provider traffic. AI stays unavailable for live traffic unless this is APPROVED. Every status change is audited." />
      {searchParams.msg ? <div className="card p-3 text-sm text-slate-700">{searchParams.msg}</div> : null}

      <div className="card max-w-2xl p-4 text-sm">
        Current status: <span className={g?.status === "APPROVED" ? "font-semibold text-emerald-600" : "font-semibold text-slate-700"}>{g?.status ?? "none"}</span>
        {g?.approver ? <span className="text-slate-500"> · approved by {g.approver} {g.approvalDate ? "on " + g.approvalDate.toISOString().slice(0, 10) : ""}</span> : null}
      </div>

      <form action={saveGovernanceForm} className="card max-w-2xl space-y-3 p-6">
        <h2 className="text-sm font-semibold text-slate-800">Governance details</h2>
        <label className="block text-sm">Pilot scope<textarea name="pilotScope" defaultValue={g?.pilotScope ?? ""} rows={2} className="input mt-1" /></label>
        <label className="block text-sm">Approved data classes<input name="approvedDataClasses" defaultValue={g?.approvedDataClasses ?? ""} className="input mt-1" placeholder="name, company, property, motivation, owner name, message bodies" /></label>
        <label className="block text-sm">Excluded data classes<input name="excludedDataClasses" defaultValue={g?.excludedDataClasses ?? ""} className="input mt-1" placeholder="phone (masked), email (masked), internal notes" /></label>
        <label className="block text-sm">Masking policy version<input name="maskingPolicyVersion" defaultValue={g?.maskingPolicyVersion ?? ""} className="input mt-1" placeholder="PILOT_AI_POLICY" /></label>
        <label className="block text-sm">ZDR decision<input name="zdrDecision" defaultValue={g?.zdrDecision ?? ""} className="input mt-1" placeholder="enabled / not available / accepted-without" /></label>
        <label className="block text-sm">Authorized Anthropic account / workspace<input name="anthropicAccount" defaultValue={g?.anthropicAccount ?? ""} className="input mt-1" /></label>
        <label className="block text-sm">Approved model<input name="approvedModel" defaultValue={g?.approvedModel ?? ""} className="input mt-1" /></label>
        <label className="block text-sm">Notes<textarea name="notes" defaultValue={g?.notes ?? ""} rows={2} className="input mt-1" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="submitForApproval" /> Submit for approval (moves to PENDING_APPROVAL)</label>
        <button type="submit" className="btn-primary">Save governance</button>
      </form>

      <form action={decideGovernanceForm} className="card max-w-2xl space-y-3 p-6">
        <h2 className="text-sm font-semibold text-slate-800">Decision</h2>
        <label className="block text-sm">Approving authority (name / role)<input name="approver" className="input mt-1" /></label>
        <label className="block text-sm">Notes<input name="notes" className="input mt-1" /></label>
        <div className="flex gap-2">
          <button type="submit" name="decision" value="APPROVED" className="btn-primary">Approve</button>
          <button type="submit" name="decision" value="REJECTED" className="btn-secondary">Reject</button>
          <button type="submit" name="decision" value="REVOKED" className="btn-danger">Revoke</button>
        </div>
        <p className="text-xs text-slate-400">Approving records the authority + date and unlocks live traffic (a real Anthropic key + approved model must also be configured). Every decision is written to the immutable audit trail.</p>
      </form>
    </div>
  );
}
