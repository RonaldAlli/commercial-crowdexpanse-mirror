import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { MarkAllReadButton } from "@/components/mark-all-read-button";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { NOTIFICATIONS_CAP, recentNotifications, unreadCount } from "@/lib/notifications";
import { resolveNoteLink } from "@/lib/note-links";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const [rows, unread] = await Promise.all([
    recentNotifications(user.id, user.organizationId),
    unreadCount(user.id, user.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Recent activity from your team. Your own actions aren't shown."
        actions={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      {rows.length > 0 ? (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const link = resolveNoteLink(row);
              return (
                <li
                  key={row.id}
                  className={`flex gap-4 px-5 py-4 ${row.unread ? "bg-brand-50/50" : ""}`}
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      row.unread ? "bg-brand-500" : "bg-slate-200"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-sm font-medium text-slate-900">{row.eventLabel}</p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {row.createdAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {row.eventBody ? (
                      <p className="mt-0.5 text-sm text-slate-500">{row.eventBody}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">{row.actor?.name ?? "System"}</span>
                      {link ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <Link href={link.href} className="text-brand-700 hover:underline">
                            {link.label}: {link.name}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="bell"
            title="No notifications yet"
            description="When teammates move deals, generate matches, or join the workspace, you'll see it here."
          />
        </div>
      )}

      <p className="text-xs text-slate-400">
        {unread} unread · showing latest {Math.min(rows.length, NOTIFICATIONS_CAP)} · {user.organizationName}
      </p>
    </div>
  );
}
