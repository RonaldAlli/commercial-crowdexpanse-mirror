import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { outreachStatusLabel, outreachStatusTone, touchTypeLabel } from "@/lib/contact-options";
import { channelLabel } from "@/lib/acquisition-options";
import { resolveSellerPromotion } from "@/lib/promote-seller";
import { sellerQualificationChecklist, checklistProgress } from "@/lib/acquisition-checklist";
import { getAcquisitionQueue, getDailyAcquisitionMetrics } from "@/lib/acquisition-queue";

import { logContactTouchAction } from "../contacts/actions";
import { setSellerOutreachStatus } from "../sellers/actions";

import { resolveChannelStatus } from "@/lib/comms/conversation-view";
import { buildTimeline } from "@/lib/comms/timeline";

import { getActiveSession, loadSessionFacts, isRunning } from "@/lib/acquisition-session-store";
import { deriveSessionProgress } from "@/lib/acquisition-session";
import { AcquisitionSessionBar, type ActiveSessionView } from "@/components/acquisition-session-bar";
import { resumeAcquisitionSession, endAcquisitionSession } from "./session-actions";

import { WorkspaceKeys } from "./WorkspaceKeys";
import { ConversationWorkspace } from "./ConversationWorkspace";
import { OperatorDock } from "./OperatorDock";
import { AcquisitionCockpit } from "./AcquisitionCockpit";
import { CopilotSubjectSync } from "@/components/ai-copilot/CopilotSubjectSync";
import { recordDisposition } from "./actions";
// SoftPhone/DISPOSITIONS now live in OperatorDock.

export const dynamic = "force-dynamic";

const TOUCH_TYPES = ["CALL", "TEXT", "EMAIL", "NOTE"] as const;

function dateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
function dateShort(date: Date | null): string {
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}
function relativeDay(date: Date, ref: Date): string {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.floor((midnight(ref) - midnight(date)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function AcquireWorkspacePage({ searchParams }: { searchParams: { sellerId?: string } }) {
  const user = await requireUser();
  const org = user.organizationId;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [queue, metrics] = await Promise.all([getAcquisitionQueue(org, now, 50), getDailyAcquisitionMetrics(org, startOfDay)]);

  const currentId = searchParams.sellerId && queue.some((q) => q.id === searchParams.sellerId)
    ? searchParams.sellerId
    : searchParams.sellerId ?? queue[0]?.id;

  const current = currentId
    ? await prisma.seller.findFirst({
        where: { id: currentId, organizationId: org },
        include: {
          properties: { select: { id: true, name: true, assetType: true, unitCount: true, squareFeet: true, acreage: true, yearBuilt: true, city: true, state: true } },
          owner: { select: { id: true, displayName: true } },
          touchHistory: { orderBy: { createdAt: "desc" }, take: 30, include: { createdBy: { select: { name: true } } } },
        },
      })
    : null;

  // Communications workspace data (Branch 3) — the current seller's message/call threads + provider config.
  const convMessages = current
    ? await prisma.commsMessage.findMany({ where: { organizationId: org, sellerId: current.id }, orderBy: { createdAt: "asc" }, take: 200 })
    : [];
  const convCalls = current
    ? await prisma.callRecord.findMany({ where: { organizationId: org, sellerId: current.id }, orderBy: { createdAt: "asc" }, take: 200 })
    : [];
  const commsConfig = current ? await prisma.commsProviderConfig.findUnique({ where: { organizationId: org } }) : null;
  const fmtTime = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const wsMessages = convMessages.map((m) => ({ id: m.id, channel: m.channel, direction: m.direction, body: m.body, subject: m.subject, status: m.status, timeLabel: fmtTime(m.createdAt), at: m.createdAt.getTime() }));
  const chCfg = commsConfig
    ? { smsEnabled: commsConfig.smsEnabled, emailEnabled: commsConfig.emailEnabled, whatsappEnabled: commsConfig.whatsappEnabled, hasApiKey: Boolean(commsConfig.apiKeyEnc), hasMessagingProfile: Boolean(commsConfig.messagingProfileId), hasFromNumber: Boolean(commsConfig.fromNumber) }
    : null;
  const channelStatus = {
    SMS: resolveChannelStatus(chCfg, "SMS"),
    WHATSAPP: resolveChannelStatus(chCfg, "WHATSAPP"),
    EMAIL: resolveChannelStatus(chCfg, "EMAIL"),
  };

  // Unified operator timeline — merge calls, messages, logged touches, and status changes into one stream.
  const statusEvents = current
    ? await prisma.activityLog.findMany({ where: { organizationId: org, sellerId: current.id, eventType: "seller.outreach_status_changed" }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, eventLabel: true, createdAt: true } })
    : [];
  const timelineRaw = [
    ...convCalls.map((c) => ({ kind: "call" as const, at: c.createdAt.getTime(), direction: c.direction, status: c.status, disposition: c.disposition, durationSec: c.durationSec })),
    ...convMessages.map((m) => ({ kind: "message" as const, at: m.createdAt.getTime(), channel: m.channel, direction: m.direction, status: m.status, body: m.body, subject: m.subject })),
    ...(current?.touchHistory ?? []).map((t) => ({ kind: "touch" as const, at: t.createdAt.getTime(), touchType: t.type, summary: t.summary, actor: t.createdBy?.name ?? null })),
    ...statusEvents.map((e) => ({ kind: "status" as const, at: e.createdAt.getTime(), label: e.eventLabel })),
  ];
  const wsTimeline = buildTimeline(timelineRaw).map((e) => {
    const timeLabel = fmtTime(new Date(e.at));
    switch (e.kind) {
      case "call": return { kind: e.kind, timeLabel, direction: e.direction, status: e.status, disposition: e.disposition, durationSec: e.durationSec };
      case "message": return { kind: e.kind, timeLabel, channel: e.channel, direction: e.direction, status: e.status, body: e.body, subject: e.subject };
      case "touch": return { kind: e.kind, timeLabel, touchType: e.touchType, summary: e.summary, actor: e.actor };
      case "status": return { kind: e.kind, timeLabel, label: e.label };
    }
  });

  // Acquisition session (the operator's current calling block) — all counters derive from in-window facts.
  const activeSession = await getActiveSession(org, user.id);
  let sessionView: ActiveSessionView | null = null;
  if (activeSession) {
    const facts = await loadSessionFacts(org, user.id, activeSession, now);
    const p = deriveSessionProgress(facts);
    sessionView = { ...p, startedAtMs: activeSession.startedAt.getTime() };
  }

  const running = isRunning(activeSession);

  // FULL COCKPIT TAKEOVER — while a session is running, /acquire IS the cockpit (the shell is already
  // stripped by the layout). The session is the dominant object; the seller is the current target.
  if (running && sessionView) {
    if (!current) {
      return (
        <div className="card p-8 text-center">
          <EmptyState icon="check" title="Queue clear for this session" description="No more sellers are due. End the session to see your results." />
        </div>
      );
    }
    const lastTouch = current.touchHistory[0] ?? null;
    const lastContactLabel = lastTouch
      ? `${lastTouch.summary ?? touchTypeLabel(lastTouch.type)} · ${relativeDay(lastTouch.createdAt, now)}`
      : null;
    return (
      <>
        <CopilotSubjectSync subjectId={current.id} />
        <AcquisitionCockpit
          current={current}
          primaryProperty={current.properties[0] ?? null}
        lastContactLabel={lastContactLabel}
        queue={queue}
        userRole={user.role}
        missionView={sessionView}
        messages={wsMessages}
        channelStatus={channelStatus}
        timeline={wsTimeline}
        />
      </>
    );
  }

  const metricChips = [
    { label: "Calls today", value: metrics.callsToday },
    { label: "Touches today", value: metrics.touchesToday },
    { label: "Status updates", value: metrics.statusUpdatesToday },
    { label: "In queue", value: metrics.queueSize },
  ];

  return (
    <div className="space-y-6">
      <CopilotSubjectSync subjectId={current?.id ?? null} />
      <PageHeader
        eyebrow="Seller acquisition"
        title="Acquisition workspace"
        description="Work the lead queue: call, record the outcome, schedule follow-up, qualify, and promote — without leaving this screen. Press j / k to move through the queue."
      />

      {activeSession ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
            <span aria-hidden className="text-xs">❚❚</span>
          </span>
          <div className="mr-auto">
            <p className="text-sm font-semibold text-slate-900">Session paused</p>
            <p className="text-xs text-slate-500">Your calling session is preserved. Resume to re-enter the cockpit, or end it to see results.</p>
          </div>
          <form action={resumeAcquisitionSession}>
            <button type="submit" className="btn-primary text-sm">Resume session</button>
          </form>
          <form action={endAcquisitionSession}>
            <button type="submit" className="btn text-sm">End session</button>
          </form>
        </div>
      ) : (
        <AcquisitionSessionBar active={null} />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metricChips.map((m) => (
          <article key={m.label} className="card px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{m.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{m.value.toLocaleString("en-US")}</p>
          </article>
        ))}
      </div>

      {queue.length === 0 && !current ? (
        <div className="card p-6">
          <EmptyState icon="sellers" title="Queue is clear" description="No sellers are waiting to be worked. Add or import sellers to build the queue." />
          <div className="mt-4">
            <Link className="btn-primary" href="/sellers">
              Go to sellers
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
          {/* Queue */}
          <article className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Work queue</h2>
              <Badge tone="neutral">{queue.length}</Badge>
            </div>
            {queue.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">Queue is clear.</div>
            ) : (
              <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                {queue.map((s) => {
                  const active = current != null && s.id === current.id;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/acquire?sellerId=${s.id}`}
                        className={`block px-4 py-3 transition-colors ${active ? "bg-brand-50" : "hover:bg-slate-50"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm font-medium ${active ? "text-brand-800" : "text-slate-900"}`}>{s.name}</span>
                          <Badge tone={outreachStatusTone(s.outreachStatus)}>{outreachStatusLabel(s.outreachStatus)}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {s.phone ?? "No phone"} · follow-up {dateShort(s.nextFollowUpAt)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>

          {/* Current seller work panel */}
          {current ? (
            (() => {
              const propertyIds = current.properties.map((p) => p.id);
              const idx = queue.findIndex((q) => q.id === current.id);
              const nextId = idx >= 0 && idx < queue.length - 1 ? queue[idx + 1].id : queue[0]?.id ?? current.id;
              const prevId = idx > 0 ? queue[idx - 1].id : queue[queue.length - 1]?.id ?? current.id;
              const checklist = sellerQualificationChecklist({
                phone: current.phone,
                email: current.email,
                motivation: current.motivation,
                hasProperty: propertyIds.length > 0,
                hasAcquisitionChannel: Boolean(current.acquisitionChannel),
                outreachStatus: current.outreachStatus,
              });
              const progress = checklistProgress(checklist);
              const promote = resolveSellerPromotion({
                canCreateOpportunity: can(user.role, "CREATE", "OPPORTUNITY"),
                outreachStatus: current.outreachStatus,
                sellerId: current.id,
                propertyIds,
              });
              const logAction = logContactTouchAction.bind(null, "seller", current.id);
              const statusAction = setSellerOutreachStatus.bind(null, current.id);
              const dispoAction = recordDisposition.bind(null, current.id);

              return (
                <div className="space-y-4">
                  <WorkspaceKeys prevHref={`/acquire?sellerId=${prevId}`} nextHref={`/acquire?sellerId=${nextId}`} />

                  {/* Operator dock — phone, disposition, follow-up, status, next. Scrolls with the panel;
                      sticky positioning intentionally removed pending the fixed-pane cockpit redesign. */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <OperatorDock
                      sellerId={current.id}
                      sellerName={current.name}
                      phone={current.phone}
                      outreachStatus={current.outreachStatus}
                      defaultFollowUp={dateInputValue(current.nextFollowUpAt)}
                      nextId={nextId}
                      dispoAction={dispoAction}
                      statusAction={statusAction}
                      canUpdateSeller={can(user.role, "UPDATE", "SELLER")}
                      promote={promote}
                    />
                  </div>

                  {/* Qualification checklist + promote */}
                  <article className="card p-6">
                    <div className="flex items-center justify-between">
                      <p className="eyebrow">Qualification</p>
                      <span className="text-xs font-medium text-slate-500">{progress.done}/{progress.total}</span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {checklist.map((item) => (
                        <li key={item.label} className="flex items-center gap-2 text-sm">
                          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-white ${item.done ? "bg-emerald-500" : "bg-slate-200"}`}>
                            {item.done ? <Icon name="check" className="h-3 w-3" /> : null}
                          </span>
                          <span className={item.done ? "text-slate-900" : "text-slate-500"}>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                    {promote ? (
                      <Link className="btn-primary mt-4 inline-flex" href={promote.href}>
                        <Icon name="pipeline" className="h-4 w-4" />
                        {promote.label}
                      </Link>
                    ) : current.outreachStatus !== "QUALIFIED" ? (
                      <p className="mt-4 text-xs text-slate-500">Mark the seller Qualified to promote to an opportunity.</p>
                    ) : null}
                  </article>

                  {/* Communications workspace (scrollable): SMS / WhatsApp / Email / Timeline */}
                  <ConversationWorkspace
                    sellerId={current.id}
                    phone={current.phone}
                    email={current.email}
                    messages={wsMessages}
                    channelStatus={channelStatus}
                    timeline={wsTimeline}
                  />

                  {/* Log a note / objection (secondary) */}
                  <details className="card p-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700">Log a note or objection</summary>
                    <form action={logAction} className="mt-3 space-y-2">
                      <input type="hidden" name="redirectTo" value={`/acquire?sellerId=${nextId}`} />
                      <select name="type" defaultValue="NOTE" className="input h-9 text-sm">
                        {TOUCH_TYPES.map((t) => (
                          <option key={t} value={t}>{touchTypeLabel(t)}</option>
                        ))}
                      </select>
                      <textarea name="summary" className="input min-h-[60px] resize-y text-sm" placeholder="Note or objection" />
                      <button type="submit" className="btn-primary w-full text-sm">Log &amp; next →</button>
                    </form>
                  </details>

                  {/* Seller details (reference — scrolls; the full unified history lives in the Timeline tab above) */}
                  <article className="card p-5">
                    <div className="flex items-center justify-between">
                      <p className="eyebrow">Seller details</p>
                      {(current.doNotCall || current.doNotText || current.doNotEmail) ? (
                        <div className="flex gap-1">
                          {current.doNotCall ? <Badge tone="danger">DNC</Badge> : null}
                          {current.doNotText ? <Badge tone="danger">No text</Badge> : null}
                          {current.doNotEmail ? <Badge tone="danger">No email</Badge> : null}
                        </div>
                      ) : null}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                      <div><dt className="text-xs text-slate-400">Phone</dt><dd className="text-slate-800">{current.phone ?? "—"}</dd></div>
                      <div><dt className="text-xs text-slate-400">Email</dt><dd className="truncate text-slate-800">{current.email ?? "—"}</dd></div>
                      <div><dt className="text-xs text-slate-400">Follow-up</dt><dd className="text-slate-800">{dateShort(current.nextFollowUpAt)}</dd></div>
                      <div><dt className="text-xs text-slate-400">Channel</dt><dd className="text-slate-800">{current.acquisitionChannel ? channelLabel(current.acquisitionChannel) : "—"}</dd></div>
                      {current.company ? <div><dt className="text-xs text-slate-400">Company</dt><dd className="truncate text-slate-800">{current.company}</dd></div> : null}
                      {(current.city || current.state) ? <div><dt className="text-xs text-slate-400">Location</dt><dd className="text-slate-800">{[current.city, current.state].filter(Boolean).join(", ")}</dd></div> : null}
                    </dl>
                    {current.motivation ? (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <dt className="text-xs text-slate-400">Motivation</dt>
                        <dd className="mt-0.5 text-sm text-slate-700">{current.motivation}</dd>
                      </div>
                    ) : null}
                  </article>
                </div>
              );
            })()
          ) : (
            <div className="card p-6">
              <EmptyState icon="sellers" title="Select a seller" description="Pick a seller from the queue to start working." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
