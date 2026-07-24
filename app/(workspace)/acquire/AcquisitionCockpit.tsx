import Link from "next/link";
import type { ContactOutreachStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/permissions";
import { channelLabel } from "@/lib/acquisition-options";
import { resolveSellerPromotion } from "@/lib/promote-seller";
import { touchTypeLabel } from "@/lib/contact-options";
import { SessionMissionControl, type MissionControlView } from "@/components/session-mission-control";
import { ConversationWorkspace, type WsMessage, type WsChannelStatus, type WsTimelineEntry } from "./ConversationWorkspace";
import { OperatorDock } from "./OperatorDock";
import { WorkspaceKeys } from "./WorkspaceKeys";
import { recordDisposition } from "./actions";
import { setSellerOutreachStatus } from "../sellers/actions";
import { logContactTouchAction } from "../contacts/actions";

const TOUCH_TYPES = ["CALL", "TEXT", "EMAIL", "NOTE"] as const;

function toDateInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

type CockpitSeller = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  motivation: string | null;
  acquisitionChannel: Parameters<typeof channelLabel>[0] | null;
  outreachStatus: ContactOutreachStatus;
  nextFollowUpAt: Date | null;
  doNotCall: boolean;
  doNotText: boolean;
  doNotEmail: boolean;
  properties: { id: string }[];
};

type PrimaryProperty = {
  assetType: string;
  unitCount: number | null;
  squareFeet: number | null;
  acreage: number | null;
  yearBuilt: number | null;
} | null;

type QueueItem = { id: string; name: string; outreachStatus: ContactOutreachStatus };

function titleCase(enumVal: string): string {
  return enumVal.charAt(0) + enumVal.slice(1).toLowerCase().replace(/_/g, " ");
}
function propertyFacts(p: PrimaryProperty): string[] {
  if (!p) return [];
  const facts = [titleCase(p.assetType)];
  if (p.unitCount) facts.push(`${p.unitCount} units`);
  else if (p.squareFeet) facts.push(`${p.squareFeet.toLocaleString("en-US")} sq ft`);
  else if (p.acreage) facts.push(`${p.acreage} acres`);
  if (p.yearBuilt) facts.push(`Built ${p.yearBuilt}`);
  return facts;
}

// The session cockpit body. Hierarchy: mission control → why-selling + essential context → operator
// controls → calling script (placeholder this slice) → queue / next targets. The current seller is just
// the target the session is handing the operator; the session is the dominant object.
export function AcquisitionCockpit({
  current,
  primaryProperty,
  lastContactLabel,
  queue,
  userRole,
  missionView,
  messages,
  channelStatus,
  timeline,
}: {
  current: CockpitSeller;
  primaryProperty: PrimaryProperty;
  lastContactLabel: string | null;
  queue: QueueItem[];
  userRole: Parameters<typeof can>[0];
  missionView: MissionControlView;
  messages: WsMessage[];
  channelStatus: Record<"SMS" | "WHATSAPP" | "EMAIL", WsChannelStatus>;
  timeline: WsTimelineEntry[];
}) {
  const propertyIds = current.properties.map((p) => p.id);
  const idx = queue.findIndex((q) => q.id === current.id);
  const nextId = idx >= 0 && idx < queue.length - 1 ? queue[idx + 1].id : queue[0]?.id ?? current.id;
  const prevId = idx > 0 ? queue[idx - 1].id : queue[queue.length - 1]?.id ?? current.id;
  const promote = resolveSellerPromotion({
    canCreateOpportunity: can(userRole, "CREATE", "OPPORTUNITY"),
    outreachStatus: current.outreachStatus,
    sellerId: current.id,
    propertyIds,
  });
  const dispoAction = recordDisposition.bind(null, current.id);
  const statusAction = setSellerOutreachStatus.bind(null, current.id);
  const logAction = logContactTouchAction.bind(null, "seller", current.id);
  const dncFlags = current.doNotCall || current.doNotText || current.doNotEmail;

  return (
    // FIXED multi-pane cockpit (Bloomberg / call-center style): a permanent region right of the rail. The
    // operator pane (seller context + phone + dispositions) never moves; only the content and queue panes
    // scroll, each inside its own region. The page itself does not scroll.
    <div className="fixed inset-y-0 left-[76px] right-0 flex flex-col overflow-hidden bg-slate-50">
      <WorkspaceKeys prevHref={`/acquire?sellerId=${prevId}`} nextHref={`/acquire?sellerId=${nextId}`} />

      {/* PANE — Mission control (fixed header) */}
      <div className="shrink-0 border-b border-slate-200 p-3">
        <SessionMissionControl view={missionView} />
      </div>

      {/* PANES — operator (fixed) | content (scrolls) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        {/* Operator pane — the permanent dialer region. Seller context + controls stay put. */}
        <div id="seller" className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
          <article className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Why selling · {current.name}</p>
                <p className="mt-1 text-xl font-bold leading-tight text-amber-950">{current.motivation ?? "No stated motivation — discover it on the call."}</p>
              </div>
              {dncFlags ? (
                <div className="flex shrink-0 gap-1">
                  {current.doNotCall ? <Badge tone="danger">DNC</Badge> : null}
                  {current.doNotText ? <Badge tone="danger">No text</Badge> : null}
                  {current.doNotEmail ? <Badge tone="danger">No email</Badge> : null}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {propertyFacts(primaryProperty).map((f) => (
                <span key={f} className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">{f}</span>
              ))}
              {(current.city || current.state) ? <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">{[current.city, current.state].filter(Boolean).join(", ")}</span> : null}
              {current.acquisitionChannel ? <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">{channelLabel(current.acquisitionChannel)}</span> : null}
              {current.company ? <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">{current.company}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-amber-800">
              <span><span className="font-semibold">Last contact:</span> {lastContactLabel ?? "Never contacted"}</span>
              <Link href={`/sellers/${current.id}`} className="font-medium text-amber-900 underline">Full record →</Link>
            </div>
          </article>

          <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <OperatorDock
              sellerId={current.id}
              sellerName={current.name}
              phone={current.phone}
              outreachStatus={current.outreachStatus}
              defaultFollowUp={toDateInput(current.nextFollowUpAt)}
              nextId={nextId}
              dispoAction={dispoAction}
              statusAction={statusAction}
              canUpdateSeller={can(userRole, "UPDATE", "SELLER")}
              promote={promote}
            />
          </div>

          <details className="shrink-0 card p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Log a note or objection</summary>
            <form action={logAction} className="mt-3 space-y-2">
              <input type="hidden" name="redirectTo" value={`/acquire?sellerId=${nextId}`} />
              <select name="type" defaultValue="NOTE" className="input h-9 text-sm">
                {TOUCH_TYPES.map((t) => (<option key={t} value={t}>{touchTypeLabel(t)}</option>))}
              </select>
              <textarea name="summary" className="input min-h-[60px] resize-y text-sm" placeholder="Note or objection" />
              <button type="submit" className="btn-primary w-full text-sm">Log &amp; next →</button>
            </form>
          </details>
        </div>

        {/* Content pane — scrolls independently: script + timeline/messages */}
        <div id="timeline" className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
          <article className="shrink-0 rounded-xl border border-dashed border-slate-300 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Calling script</p>
            <p className="mt-2 text-sm text-slate-500">A guided script (Intro · Discovery · Motivation · Timeline · Decision maker · Price · Next step) will appear here beside the phone.</p>
            <p className="mt-1 text-xs text-slate-400">Coming in the next slice.</p>
          </article>

          <ConversationWorkspace
            sellerId={current.id}
            phone={current.phone}
            email={current.email}
            messages={messages}
            channelStatus={channelStatus}
            timeline={timeline}
          />
        </div>
      </div>

      {/* PANE — queue / next targets (fixed footer, scrolls horizontally) */}
      <div id="queue" className="shrink-0 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-3 py-2">
          <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Next targets</h2>
          <Badge tone="neutral">{queue.length}</Badge>
          <ul className="flex flex-1 gap-2 overflow-x-auto">
            {queue.slice(0, 25).map((s) => {
              const active = s.id === current.id;
              return (
                <li key={s.id} className="shrink-0">
                  <Link href={`/acquire?sellerId=${s.id}`} className={`block rounded-lg border px-3 py-1.5 text-xs ${active ? "border-brand-400 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                    <span className="block max-w-[140px] truncate font-medium">{s.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
