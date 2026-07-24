import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { OUTREACH_STATUS_OPTIONS, outreachStatusLabel, outreachStatusTone, touchTypeLabel } from "@/lib/contact-options";
import { channelLabel } from "@/lib/acquisition-options";
import { resolveSellerPromotion } from "@/lib/promote-seller";
import { sellerQualificationChecklist, checklistProgress } from "@/lib/acquisition-checklist";
import { getAcquisitionQueue, getDailyAcquisitionMetrics } from "@/lib/acquisition-queue";

import { logContactTouchAction } from "../contacts/actions";
import { setSellerOutreachStatus } from "../sellers/actions";
import { DISPOSITIONS } from "@/lib/disposition";

import { WorkspaceKeys } from "./WorkspaceKeys";
import { SoftPhone } from "./SoftPhone";
import { recordDisposition } from "./actions";

export const dynamic = "force-dynamic";

const TOUCH_TYPES = ["CALL", "TEXT", "EMAIL", "NOTE"] as const;

function dateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
function dateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function dateShort(date: Date | null): string {
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
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
          properties: { select: { id: true } },
          owner: { select: { id: true, displayName: true } },
          touchHistory: { orderBy: { createdAt: "desc" }, take: 12, include: { createdBy: { select: { name: true } } } },
        },
      })
    : null;

  const metricChips = [
    { label: "Calls today", value: metrics.callsToday },
    { label: "Touches today", value: metrics.touchesToday },
    { label: "Status updates", value: metrics.statusUpdatesToday },
    { label: "In queue", value: metrics.queueSize },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Seller acquisition"
        title="Acquisition workspace"
        description="Work the lead queue: call, record the outcome, schedule follow-up, qualify, and promote — without leaving this screen. Press j / k to move through the queue."
      />

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
                <div className="space-y-6">
                  <WorkspaceKeys prevHref={`/acquire?sellerId=${prevId}`} nextHref={`/acquire?sellerId=${nextId}`} />

                  <article className="card p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/sellers/${current.id}`} className="text-lg font-semibold text-slate-900 hover:text-brand-700">
                          {current.name}
                        </Link>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {current.company ?? "—"}
                          {current.acquisitionChannel ? ` · ${channelLabel(current.acquisitionChannel)}` : ""}
                        </p>
                      </div>
                      <Badge tone={outreachStatusTone(current.outreachStatus)}>{outreachStatusLabel(current.outreachStatus)}</Badge>
                    </div>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-slate-500">Phone</dt>
                        <dd className="mt-0.5 text-sm font-medium text-slate-900">{current.phone ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Email</dt>
                        <dd className="mt-0.5 truncate text-sm font-medium text-slate-900">{current.email ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Follow-up</dt>
                        <dd className="mt-0.5 text-sm font-medium text-slate-900">{dateShort(current.nextFollowUpAt)}</dd>
                      </div>
                    </dl>
                    {current.motivation ? (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="eyebrow">Motivation</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{current.motivation}</p>
                      </div>
                    ) : null}
                  </article>

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

                  {/* Operator console — every tool needed during the call, without leaving the screen */}
                  <article className="card p-6">
                    <p className="eyebrow">Operator console</p>

                    {/* Embedded browser softphone (Branch 2). Inert until a voice provider is configured. */}
                    <div className="mt-3">
                      <SoftPhone toNumber={current.phone} />
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {current.phone ? (
                          <a href={`sms:${current.phone}`} className="text-brand-700 hover:underline">Text (device)</a>
                        ) : null}
                        {current.email ? (
                          <a href={`mailto:${current.email}`} className="text-brand-700 hover:underline">Email (device)</a>
                        ) : null}
                      </div>
                    </div>

                    {/* Disposition + follow-up: one tap logs the call, applies the outcome, advances */}
                    <form action={dispoAction} className="mt-5 space-y-3">
                      <input type="hidden" name="redirectTo" value={`/acquire?sellerId=${nextId}`} />
                      <label className="block text-xs text-slate-500">
                        Next follow-up
                        <input type="date" name="nextFollowUpAt" defaultValue={dateInputValue(current.nextFollowUpAt)} className="input mt-1 h-10 max-w-[200px] text-sm" />
                      </label>
                      <p className="text-xs font-medium text-slate-500">Disposition — logs the call, updates the lead, and moves to the next seller</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {DISPOSITIONS.map((d) => (
                          <button key={d} type="submit" name="disposition" value={d} className="btn text-xs">
                            {d}
                          </button>
                        ))}
                      </div>
                    </form>

                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                      {can(user.role, "UPDATE", "SELLER") ? (
                        <form action={statusAction} className="flex items-center gap-2">
                          <select name="outreachStatus" defaultValue={current.outreachStatus} className="input h-9 text-sm">
                            {OUTREACH_STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {outreachStatusLabel(s)}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn text-sm">
                            Set status
                          </button>
                        </form>
                      ) : null}
                      <Link href={`/acquire?sellerId=${nextId}`} className="btn-ghost ml-auto text-sm">
                        Next seller →
                      </Link>
                    </div>

                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs font-medium text-slate-500">Log a custom note or objection…</summary>
                      <form action={logAction} className="mt-3 space-y-3">
                        <input type="hidden" name="redirectTo" value={`/acquire?sellerId=${nextId}`} />
                        <select name="type" defaultValue="NOTE" className="input h-10 text-sm">
                          {TOUCH_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {touchTypeLabel(t)}
                            </option>
                          ))}
                        </select>
                        <textarea name="summary" className="input min-h-[70px] resize-y text-sm" placeholder="Note, objection, or other outcome" />
                        <button type="submit" className="btn-primary w-full">
                          Log &amp; next →
                        </button>
                      </form>
                    </details>

                    <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
                      <kbd className="rounded bg-slate-100 px-1">j</kbd> next · <kbd className="rounded bg-slate-100 px-1">k</kbd> previous
                    </p>
                  </article>

                  {/* Contact history */}
                  <article className="card overflow-hidden">
                    <div className="border-b border-slate-100 px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">Contact history</h2>
                    </div>
                    {current.touchHistory.length === 0 ? (
                      <div className="px-5 py-6">
                        <EmptyState icon="activity" title="No contact yet" description="Logged calls, texts, emails, and notes appear here." />
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {current.touchHistory.map((touch) => (
                          <li key={touch.id} className="px-5 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <Badge tone="info">{touchTypeLabel(touch.type)}</Badge>
                              <span className="text-xs text-slate-400">
                                {dateTime(touch.createdAt)}
                                {touch.createdBy?.name ? ` · ${touch.createdBy.name}` : ""}
                              </span>
                            </div>
                            {touch.summary ? <p className="mt-1 text-sm text-slate-600">{touch.summary}</p> : null}
                          </li>
                        ))}
                      </ul>
                    )}
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
