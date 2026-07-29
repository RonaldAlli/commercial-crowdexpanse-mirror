// CRE Operating Workspace — UI M1 Increment 2: Seller Record (presentational).
//
// Contract:
//   guarantees — presents a seller record over EXISTING data + EXISTING server actions: Observed facts,
//     the Computed qualification checklist/progress, Recommended promotion guidance ONLY where the
//     existing resolver returns it, honest per-channel communications gate STATE (no active send
//     controls), and the existing seller activity timeline. Mutations go through the existing bound
//     actions passed in as props; a pending state is shown; the actions' own revalidate/redirect refresh
//     the UI.
//   does NOT — fetch data, create an opportunity, compute a Next Best Action, infer missing information
//     beyond the existing checklist, or expose any inert comms control as if working.
//   later increments supply — Next Best Action + Missing Information synthesis (Increment 5).

import Link from "next/link";

import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import { SubmitButton } from "@/components/workspace-ui/seller/SubmitButton";
import { checklistRatioLabel, statusView, type GateChannelView, type PromotionView } from "@/lib/workspace-ui/seller-view";

type Activity = { id: string; eventType: string; eventLabel: string; eventBody: string | null; createdAt: Date; actorType: string };

export type SellerRecordViewProps = {
  seller: {
    id: string; name: string; company: string | null; email: string | null; phone: string | null;
    city: string | null; state: string | null; motivation: string | null;
    outreachStatus: import("@prisma/client").ContactOutreachStatus;
    acquisitionChannel: string | null; nextFollowUpAt: Date | null;
  };
  owner: { id: string; displayName: string } | null;
  propertyCount: number;
  checklist: { items: { label: string; done: boolean }[]; progress: { done: number; total: number } };
  promotion: PromotionView;
  gate: GateChannelView[];
  activities: Activity[];
  statusOptions: import("@prisma/client").ContactOutreachStatus[];
  dispositions: readonly string[];
  touchTypes: readonly string[];
  backHref: string;
  actions: {
    setStatus: (formData: FormData) => Promise<void>;
    recordDisposition: (formData: FormData) => Promise<void>;
    logTouch: (formData: FormData) => Promise<void>;
  };
};

function fmtDateTime(d: Date): string {
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function SellerRecordView(p: SellerRecordViewProps) {
  const s = p.seller;
  const observed: { label: string; value: string | null }[] = [
    { label: "Company", value: s.company },
    { label: "Email", value: s.email },
    { label: "Phone", value: s.phone },
    { label: "Market", value: [s.city, s.state].filter(Boolean).join(", ") || null },
    { label: "Acquisition source", value: s.acquisitionChannel },
    { label: "Owner", value: p.owner?.displayName ?? null },
    { label: "Linked properties", value: String(p.propertyCount) },
    { label: "Next follow-up", value: s.nextFollowUpAt ? new Date(s.nextFollowUpAt).toISOString().slice(0, 10) : null },
    { label: "Motivation", value: s.motivation },
  ];
  const status = statusView(s.outreachStatus);
  const recordHref = `/seller-queue/${encodeURIComponent(s.id)}`;

  return (
    <div className="space-y-5">
      <Link href={p.backHref} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <span aria-hidden="true" className="inline-flex rotate-180"><Icon name="chevronRight" className="h-4 w-4" /></span>
        Back to queue
      </Link>

      <PageHeader
        title={s.name}
        description={s.company ?? undefined}
        actions={<span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${status.tone === "danger" ? "bg-rose-50 text-rose-800 ring-rose-200" : status.tone === "success" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : status.tone === "warning" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>{status.label}</span>}
      />

      <WorkspaceSection title="Overview" id="rec-overview" actions={<TaxonomyBadge kind="observed" />}>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {observed.map((d) => (
            <div key={d.label} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 py-1 text-sm">
              <dt className="font-medium text-slate-500">{d.label}</dt>
              <dd className="text-slate-800">{d.value ?? <span className="italic text-slate-400">Not provided</span>}</dd>
            </div>
          ))}
        </dl>
      </WorkspaceSection>

      <WorkspaceSection title="Qualification" id="rec-qual" actions={<TaxonomyBadge kind="computed" />}>
        <p className="mb-2 text-sm font-medium text-slate-700">{checklistRatioLabel(p.checklist.progress)}</p>
        <ul className="space-y-1">
          {p.checklist.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="inline-flex">
                <Icon name={item.done ? "check" : "close"} className={`h-4 w-4 ${item.done ? "text-emerald-600" : "text-slate-300"}`} />
              </span>
              <span className={item.done ? "text-slate-800" : "text-slate-500"}>{item.label}</span>
              <span className="sr-only">{item.done ? "(complete)" : "(incomplete)"}</span>
            </li>
          ))}
        </ul>
      </WorkspaceSection>

      <WorkspaceSection title="Promotion" id="rec-promo" actions={<TaxonomyBadge kind="recommended" />}>
        {p.promotion.state === "eligible" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link href={p.promotion.href} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <span aria-hidden="true" className="inline-flex"><Icon name="arrowUpRight" className="h-4 w-4" /></span>
              {p.promotion.label}
            </Link>
            <span className="text-xs text-slate-500">Continues through the existing New-Opportunity path; this does not create an opportunity directly.</span>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{p.promotion.reason}</p>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Communications" id="rec-comms">
        <p className="mb-2 text-xs text-slate-500">Contact-eligibility state only. Sending is not part of this surface.</p>
        <ul className="space-y-1">
          {p.gate.map((g) => (
            <li key={g.channel} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="inline-flex">
                <Icon name={g.allowed ? "check" : "close"} className={`h-4 w-4 ${g.allowed ? "text-emerald-600" : "text-slate-400"}`} />
              </span>
              <span className="font-medium text-slate-700">{g.label}:</span>
              <span className={g.allowed ? "text-emerald-700" : "text-slate-500"}>{g.allowed ? "Allowed" : g.reason ?? "Blocked"}</span>
              <span className="sr-only">{g.allowed ? "allowed" : "blocked"}</span>
            </li>
          ))}
        </ul>
      </WorkspaceSection>

      <div className="grid gap-5 lg:grid-cols-3">
        <WorkspaceSection title="Update status" id="rec-status">
          <form action={p.actions.setStatus} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Outreach status</span>
              <select name="outreachStatus" defaultValue={s.outreachStatus} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                {p.statusOptions.map((o) => (<option key={o} value={o}>{statusView(o).label}</option>))}
              </select>
            </label>
            <SubmitButton pendingLabel="Saving…">Save status</SubmitButton>
          </form>
        </WorkspaceSection>

        <WorkspaceSection title="Log disposition" id="rec-disp">
          <form action={p.actions.recordDisposition} className="space-y-3">
            <input type="hidden" name="redirectTo" value={recordHref} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Disposition</span>
              <select name="disposition" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                {p.dispositions.map((d) => (<option key={d} value={d}>{d}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Next follow-up (optional)</span>
              <input type="date" name="nextFollowUpAt" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            </label>
            <SubmitButton pendingLabel="Recording…">Record disposition</SubmitButton>
          </form>
        </WorkspaceSection>

        <WorkspaceSection title="Log contact" id="rec-touch">
          <form action={p.actions.logTouch} className="space-y-3">
            <input type="hidden" name="redirectTo" value={recordHref} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Type</span>
              <select name="type" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                {p.touchTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Summary</span>
              <input type="text" name="summary" maxLength={280} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            </label>
            <SubmitButton pendingLabel="Logging…">Log contact</SubmitButton>
          </form>
        </WorkspaceSection>
      </div>

      <WorkspaceSection title="Activity" id="rec-activity">
        {p.activities.length === 0 ? (
          <StateBlock state="empty" message="No activity yet" />
        ) : (
          <ol className="space-y-2">
            {p.activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span aria-hidden="true" className="mt-0.5 inline-flex text-slate-300"><Icon name="activity" className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-slate-800">{a.eventLabel}</p>
                  <p className="text-xs text-slate-400">
                    <span className="font-mono">{a.eventType}</span> · {fmtDateTime(a.createdAt)} · {a.actorType === "USER" ? "operator" : a.actorType.toLowerCase()}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </WorkspaceSection>
    </div>
  );
}
