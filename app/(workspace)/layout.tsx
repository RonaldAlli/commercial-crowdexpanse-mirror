import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const unread = await unreadCount(user.id, user.organizationId);

  return (
    <WorkspaceShell userEmail={user.email} userRole={user.role} unreadCount={unread}>
      {children}
    </WorkspaceShell>
  );
}
