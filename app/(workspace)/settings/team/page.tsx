import { InvitationStatus, UserRole } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { MemberRoleSelect } from "@/components/member-role-select";
import { MemberLifecycleControls } from "@/components/member-lifecycle-controls";
import { InviteForm, ResendInviteButton, RevokeInviteButton } from "@/components/invite-controls";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleLabel, roleTone } from "@/lib/user-options";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireRole(UserRole.ADMIN);

  const now = new Date();
  const [members, openInvites] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, email: true, role: true, createdAt: true, lifecycleState: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    // Every not-yet-accepted invite (pending/expired/revoked) so each can be
    // resent in place — one invitation row per person.
    prisma.invitation.findMany({
      where: {
        organizationId: user.organizationId,
        status: { not: InvitationStatus.ACCEPTED },
      },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Display status: a PENDING invite past its expiry reads as EXPIRED (the row is
  // flipped for real on the next accept attempt — see markExpiredIfNeeded).
  const inviteRows = openInvites.map((inv) => {
    const effectiveStatus =
      inv.status === InvitationStatus.PENDING && inv.expiresAt <= now ? InvitationStatus.EXPIRED : inv.status;
    return { ...inv, effectiveStatus, isPending: effectiveStatus === InvitationStatus.PENDING };
  });
  const inviteStatusMeta: Record<string, { label: string; tone: "info" | "neutral" | "danger" }> = {
    PENDING: { label: "Pending", tone: "info" },
    EXPIRED: { label: "Expired", tone: "neutral" },
    REVOKED: { label: "Revoked", tone: "danger" },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Team"
        description="Everyone in your organization and their role. Admins can change roles; the last admin can't be removed."
      />

      <div className="card overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {members.map((m) => {
            const isSelf = m.id === user.id;
            const deactivated = m.lifecycleState !== "ACTIVE";
            return (
              <li key={m.id} className={`flex items-center justify-between gap-4 px-5 py-4 ${deactivated ? "bg-slate-50/60" : ""}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${deactivated ? "bg-slate-400" : "bg-slate-900"}`}>
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`truncate text-sm font-medium ${deactivated ? "text-slate-500" : "text-slate-900"}`}>{m.name}</span>
                      {isSelf ? <span className="text-[10px] uppercase tracking-wide text-slate-400">You</span> : null}
                      <Badge tone={roleTone(m.role)}>{roleLabel(m.role)}</Badge>
                      {deactivated ? <Badge tone="danger">Deactivated</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-slate-500">{m.email}</p>
                    <p className="text-xs text-slate-400">
                      Joined {m.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {/* Role can't change while deactivated — reactivate first. */}
                  <MemberRoleSelect userId={m.id} current={m.role} disabled={deactivated} />
                  <MemberLifecycleControls userId={m.id} isSelf={isSelf} deactivated={deactivated} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <section className="card p-6">
        <h2 className="text-base font-semibold text-slate-900">Invite a teammate</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">
          Generate a copy-link invitation. Share it directly — the link is shown once and can&apos;t be
          retrieved later.
        </p>
        <InviteForm />
      </section>

      {inviteRows.length > 0 ? (
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Invitations</h2>
            <p className="text-xs text-slate-500">{inviteRows.length} not yet accepted. Resend rotates the link and invalidates the previous one.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {inviteRows.map((inv) => {
              const meta = inviteStatusMeta[inv.effectiveStatus];
              return (
                <li key={inv.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{inv.email}</span>
                      <Badge tone={roleTone(inv.role)}>{roleLabel(inv.role)}</Badge>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      Invited {inv.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {inv.isPending ? (
                        <>
                          {" · expires "}
                          {inv.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-4">
                    <ResendInviteButton invitationId={inv.id} />
                    {inv.isPending ? <RevokeInviteButton invitationId={inv.id} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-slate-400">
        {members.length} member{members.length === 1 ? "" : "s"} · {user.organizationName}
      </p>
    </div>
  );
}
