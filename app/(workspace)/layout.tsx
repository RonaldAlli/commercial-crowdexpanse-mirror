import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SessionCockpitChrome } from "@/components/session-cockpit-chrome";
import { CopilotProvider } from "@/components/ai-copilot/CopilotProvider";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveCopilotStatus } from "@/lib/ai/runtime-config";
import { unreadCount } from "@/lib/notifications";
import { getActiveSession, isRunning } from "@/lib/acquisition-session-store";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // The Copilot provider wraps BOTH chromes so its state survives the normal↔cockpit
  // swap. `aiConfigured` is resolved server-side per-org (env override OR the
  // governance-gated encrypted store — same resolver the route uses) and passed down;
  // the copilot stays inert when false.
  const aiConfigured = (await resolveCopilotStatus(user.organizationId)).configured;

  // Full cockpit takeover: while an acquisition session is RUNNING, the normal shell (sidebar, nav, search)
  // is replaced by the minimal cockpit chrome. Pausing / exiting / ending the session restores the shell.
  const session = await getActiveSession(user.organizationId, user.id);
  if (isRunning(session)) {
    return (
      <CopilotProvider aiConfigured={aiConfigured}>
        <SessionCockpitChrome>{children}</SessionCockpitChrome>
      </CopilotProvider>
    );
  }

  const unread = await unreadCount(user.id, user.organizationId);

  // Global-nav visibility for the released Milestone-1 workspace surfaces, computed SERVER-SIDE
  // from the existing RBAC matrix (never import can() into the client shell). Seller Queue needs
  // seller read; the Command Center orchestrates whichever of sellers/opportunities the role may read.
  const canSeeSellerQueue = can(user.role, "READ", "SELLER");
  const canSeeCommandCenter = canSeeSellerQueue || can(user.role, "READ", "OPPORTUNITY");

  return (
    <CopilotProvider aiConfigured={aiConfigured}>
      <WorkspaceShell
        userEmail={user.email}
        userRole={user.role}
        unreadCount={unread}
        showCommandCenter={canSeeCommandCenter}
        showSellerQueue={canSeeSellerQueue}
      >
        {children}
      </WorkspaceShell>
    </CopilotProvider>
  );
}
