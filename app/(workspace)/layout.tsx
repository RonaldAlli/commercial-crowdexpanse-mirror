import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <WorkspaceShell userEmail={user.email} userRole={user.role}>
      {children}
    </WorkspaceShell>
  );
}
