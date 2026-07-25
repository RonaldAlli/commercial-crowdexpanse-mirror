import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SessionCockpitChrome } from "@/components/session-cockpit-chrome";
import { CopilotProvider } from "@/components/ai-copilot/CopilotProvider";
import { requireUser } from "@/lib/auth";
import { resolveAiStatus } from "@/lib/ai/llm";
import { unreadCount } from "@/lib/notifications";
import { getActiveSession, isRunning } from "@/lib/acquisition-session-store";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // The Copilot provider wraps BOTH chromes so its state survives the normal↔cockpit
  // swap. `aiConfigured` is resolved server-side (env) and passed down; the copilot
  // stays inert when false.
  const aiConfigured = resolveAiStatus().configured;

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
  return (
    <CopilotProvider aiConfigured={aiConfigured}>
      <WorkspaceShell userEmail={user.email} userRole={user.role} unreadCount={unread}>
        {children}
      </WorkspaceShell>
    </CopilotProvider>
  );
}
