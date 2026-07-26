"use client";

import { useEffect } from "react";

import { useCopilot } from "./CopilotProvider";

// Publishes the workspace's ACTIVE seller id (resolved server-side by the acquisition
// page as searchParams.sellerId ?? queue[0]) into the shared Copilot context, so the
// Copilot always targets the same seller as the dialer/timeline/panel — without
// duplicating the seller-resolution logic. Renders nothing. Clears on unmount (e.g.
// navigating away from the workspace, or an empty queue).
export function CopilotSubjectSync({ subjectId }: { subjectId: string | null }) {
  const { setSubjectId } = useCopilot();
  useEffect(() => {
    setSubjectId(subjectId);
    return () => setSubjectId(null);
  }, [subjectId, setSubjectId]);
  return null;
}
