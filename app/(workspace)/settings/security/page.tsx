import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleLabel, roleTone } from "@/lib/user-options";

export const dynamic = "force-dynamic";

// Read-only denied-action report (Permission Layer Slice 2). ADMIN-only,
// org-scoped. Reads existing `authorization.denied` ActivityLog rows — no new
// table, no thresholds, no alerting. Every row here represents an ATTEMPTED
// mutation a user was not permitted to perform (page loads are never logged).
const WINDOW = 500; // most-recent denied attempts summarized/counted

type DeniedBody = {
  role?: string;
  resource?: string;
  action?: string;
  targetId?: string | null;
  detail?: string | null;
};

function parseBody(raw: string | null): DeniedBody {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DeniedBody;
  } catch {
    return {};
  }
}

export default async function SecurityPage() {
  const admin = await requireRole(UserRole.ADMIN);

  const rows = await prisma.activityLog.findMany({
    where: { organizationId: admin.organizationId, eventType: "authorization.denied" },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: WINDOW,
  });

  const events = rows.map((r) => {
    const body = parseBody(r.eventBody);
    return {
      id: r.id,
      createdAt: r.createdAt,
      actorName: r.actor?.name ?? "(removed user)",
      actorEmail: r.actor?.email ?? null,
      // Role AT the time of denial (audit value), not the actor's current role.
      role: body.role ?? null,
      resource: body.resource ?? "—",
      action: body.action ?? "—",
      // Stage-move denials carry a "current -> target" detail; fall back to targetId.
      target: body.detail ?? body.targetId ?? "—",
    };
  });

  // Simple counts across the window — by actor and by resource/action pair.
  const byActor = new Map<string, number>();
  const byResourceAction = new Map<string, number>();
  for (const e of events) {
    byActor.set(e.actorName, (byActor.get(e.actorName) ?? 0) + 1);
    const key = `${e.resource} · ${e.action}`;
    byResourceAction.set(key, (byResourceAction.get(key) ?? 0) + 1);
  }
  const topActors = Array.from(byActor.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topResourceActions = Array.from(byResourceAction.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const windowNote =
    rows.length >= WINDOW ? `most recent ${WINDOW} attempts` : `${rows.length} attempt${rows.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Access denials"
        description="Attempts to perform an action the user's role does not allow. Read-only audit — page loads are never recorded, only attempted changes."
      />

      {events.length === 0 ? (
        <div className="card">
          <EmptyState icon="activity" title="No denied attempts" description="No unauthorized action attempts have been recorded for your organization." />
        </div>
      ) : (
        <>
          {/* Summary counts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <article className="card">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">By user</h2>
                <p className="text-xs text-slate-500">Denied attempts across the {windowNote}.</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {topActors.map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between px-5 py-2.5">
                    <span className="truncate text-sm text-slate-700">{name}</span>
                    <Badge tone="neutral">{count}</Badge>
                  </li>
                ))}
              </ul>
            </article>

            <article className="card">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">By resource &amp; action</h2>
                <p className="text-xs text-slate-500">Denied attempts across the {windowNote}.</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {topResourceActions.map(([key, count]) => (
                  <li key={key} className="flex items-center justify-between px-5 py-2.5">
                    <span className="metric truncate text-sm text-slate-700">{key}</span>
                    <Badge tone="neutral">{count}</Badge>
                  </li>
                ))}
              </ul>
            </article>
          </div>

          {/* Detail table */}
          <article className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Recent denied attempts</h2>
              <p className="text-xs text-slate-500">Showing the {windowNote}, most recent first.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50/60">
                  <tr>
                    <th className="table-head">User</th>
                    <th className="table-head">Role</th>
                    <th className="table-head">Resource</th>
                    <th className="table-head">Action</th>
                    <th className="table-head">Target</th>
                    <th className="table-head">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((e) => (
                    <tr key={e.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="table-cell">
                        <p className="font-medium text-slate-900">{e.actorName}</p>
                        {e.actorEmail ? <p className="text-xs text-slate-500">{e.actorEmail}</p> : null}
                      </td>
                      <td className="table-cell">
                        {e.role ? <Badge tone={roleTone(e.role)}>{roleLabel(e.role)}</Badge> : "—"}
                      </td>
                      <td className="table-cell metric whitespace-nowrap">{e.resource}</td>
                      <td className="table-cell metric whitespace-nowrap">{e.action}</td>
                      <td className="table-cell metric max-w-[240px] truncate text-slate-600">{e.target}</td>
                      <td className="table-cell whitespace-nowrap text-slate-500">
                        {e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </div>
  );
}
