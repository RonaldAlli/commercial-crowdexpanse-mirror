import { getActiveSession, loadSessionFacts } from "@/lib/acquisition-session-store";
import { deriveSessionProgress } from "@/lib/acquisition-session";

import type { ContextProvider } from "./types";
import { renderSession } from "./render";

// The operator's own active calling session (org- and actor-scoped inside the
// store helpers). Null when no session is running.
export const sessionProvider: ContextProvider = {
  key: "session",
  async load(ctx) {
    const active = await getActiveSession(ctx.user.organizationId, ctx.user.id);
    if (!active) return null;
    const facts = await loadSessionFacts(ctx.user.organizationId, ctx.user.id, active, new Date());
    return renderSession(deriveSessionProgress(facts));
  },
};
