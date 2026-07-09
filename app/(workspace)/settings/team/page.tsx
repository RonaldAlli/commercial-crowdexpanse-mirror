import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { MemberRoleSelect } from "@/components/member-role-select";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleLabel, roleTone } from "@/lib/user-options";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireRole(UserRole.ADMIN);

  const members = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

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

      <p className="text-xs text-slate-400">
        {members.length} member{members.length === 1 ? "" : "s"} · {user.organizationName}
      </p>
    </div>
  );
}
