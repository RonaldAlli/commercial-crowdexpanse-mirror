import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SessionCockpitChrome } from "@/components/session-cockpit-chrome";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { getActiveSession, isRunning } from "@/lib/acquisition-session-store";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // Full cockpit takeover: while an acquisition session is RUNNING, the normal shell (sidebar, nav, search)
  // is replaced by the minimal cockpit chrome. Pausing / exiting / ending the session restores the shell.
  const session = await getActiveSession(user.organizationId, user.id);
  if (isRunning(session)) {
    return <SessionCockpitChrome>{children}</SessionCockpitChrome>;
  }

  const unread = await unreadCount(user.id, user.organizationId);
  return (
    <WorkspaceShell userEmail={user.email} userRole={user.role} unreadCount={unread}>
      {children}
    </WorkspaceShell>
  );
}
