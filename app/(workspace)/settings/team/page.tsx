import { InvitationStatus, UserRole } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { MemberRoleSelect } from "@/components/member-role-select";
import { InviteForm, RevokeInviteButton } from "@/components/invite-controls";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleLabel, roleTone } from "@/lib/user-options";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireRole(UserRole.ADMIN);

  const now = new Date();
  const [members, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    // Active invites only — PENDING and not past expiry (lazy expiry).
    prisma.invitation.findMany({
      where: {
        organizationId: user.organizationId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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
            return (
              <li key={m.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{m.name}</span>
                      {isSelf ? <span className="text-[10px] uppercase tracking-wide text-slate-400">You</span> : null}
                      <Badge tone={roleTone(m.role)}>{roleLabel(m.role)}</Badge>
                    </div>
                    <p className="truncate text-xs text-slate-500">{m.email}</p>
                    <p className="text-xs text-slate-400">
                      Joined {m.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <MemberRoleSelect userId={m.id} current={m.role} />
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

      {pendingInvites.length > 0 ? (
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Pending invitations</h2>
            <p className="text-xs text-slate-500">{pendingInvites.length} awaiting acceptance.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{inv.email}</span>
                    <Badge tone={roleTone(inv.role)}>{roleLabel(inv.role)}</Badge>
                  </div>
                  <p className="text-xs text-slate-400">
                    Invited {inv.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" · expires "}
                    {inv.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <RevokeInviteButton invitationId={inv.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-slate-400">
        {members.length} member{members.length === 1 ? "" : "s"} · {user.organizationName}
      </p>
    </div>
  );
}
