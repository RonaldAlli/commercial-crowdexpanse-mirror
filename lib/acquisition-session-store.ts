import { prisma } from "@/lib/prisma";
import { dispositionEffect } from "@/lib/disposition";
import { outreachStatusLabel } from "@/lib/contact-options";
import type { SessionFacts } from "@/lib/acquisition-session";

// The DB side of Acquisition Sessions: the current operator's open session, and the in-window fact counts
// the session bar derives from. All queries are org-scoped AND actor-scoped (this operator's own work),
// counting authoritative facts — the same rows recordDisposition / setSellerOutreachStatus already write.

export type ActiveSession = { id: string; goalCalls: number; startedAt: Date; pausedAt: Date | null };

/** The operator's currently-open session (endedAt null), if any — running OR paused. One per user. */
export async function getActiveSession(organizationId: string, userId: string): Promise<ActiveSession | null> {
  const s = await prisma.acquisitionSession.findFirst({
    where: { organizationId, userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, goalCalls: true, startedAt: true, pausedAt: true },
  });
  return s;
}

/** Running = open and not paused. The cockpit takeover applies only while running. */
export function isRunning(session: ActiveSession | null): boolean {
  return session != null && session.pausedAt == null;
}

// The canonical fact signatures (kept in sync with the actions via the shared pure helpers, not hardcoded).
const APPOINTMENT_SUMMARY = dispositionEffect("Appointment set").summary; // "Call — appointment set"
const QUALIFIED_SUFFIX = `→ ${outreachStatusLabel("QUALIFIED")}`; // matches the status-change eventLabel tail

/** Count the operator's in-window facts and shape them for deriveSessionProgress(). */
export async function loadSessionFacts(
  organizationId: string,
  userId: string,
  session: ActiveSession,
  now: Date,
): Promise<SessionFacts> {
  const since = { gte: session.startedAt };
  const [completed, appointments, qualified] = await Promise.all([
    prisma.contactTouch.count({ where: { organizationId, createdById: userId, type: "CALL", createdAt: since } }),
    prisma.contactTouch.count({ where: { organizationId, createdById: userId, type: "CALL", summary: APPOINTMENT_SUMMARY, createdAt: since } }),
    prisma.activityLog.count({
      where: { organizationId, actorId: userId, eventType: "seller.outreach_status_changed", eventLabel: { endsWith: QUALIFIED_SUFFIX }, createdAt: since },
    }),
  ]);
  return {
    goalCalls: session.goalCalls,
    completed,
    appointments,
    qualified,
    startedAtMs: session.startedAt.getTime(),
    nowMs: now.getTime(),
  };
}
