import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { OUTREACH_STATUS_OPTIONS, outreachStatusLabel, outreachStatusTone } from "@/lib/contact-options";
import { DISPOSITIONS } from "@/lib/disposition";
import { SoftPhone } from "./SoftPhone";

// The operator control cluster: phone + dispositions + follow-up + status + next — one group, no scrolling
// to reach any of it. Shared by the normal sticky panel and the session cockpit so both stay in lockstep.
export function OperatorDock({
  sellerId,
  sellerName,
  phone,
  outreachStatus,
  defaultFollowUp,
  nextId,
  dispoAction,
  statusAction,
  canUpdateSeller,
  promote,
}: {
  sellerId: string;
  sellerName: string;
  phone: string | null;
  outreachStatus: Parameters<typeof outreachStatusLabel>[0];
  defaultFollowUp: string;
  nextId: string;
  dispoAction: (formData: FormData) => void | Promise<void>;
  statusAction: (formData: FormData) => void | Promise<void>;
  canUpdateSeller: boolean;
  promote: { href: string; label: string } | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/sellers/${sellerId}`} className="truncate text-base font-semibold text-slate-900 hover:text-brand-700">
          {sellerName}
        </Link>
        <Badge tone={outreachStatusTone(outreachStatus)}>{outreachStatusLabel(outreachStatus)}</Badge>
      </div>

      <SoftPhone toNumber={phone} />

      {/* Disposition — immediately adjacent to the phone; one tap logs + advances */}
      <form action={dispoAction} className="space-y-2 border-t border-slate-100 pt-3">
        <input type="hidden" name="redirectTo" value={`/acquire?sellerId=${nextId}`} />
        <div className="grid grid-cols-3 gap-1.5">
          {DISPOSITIONS.map((d) => (
            <button key={d} type="submit" name="disposition" value={d} className="btn text-xs">
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" name="nextFollowUpAt" defaultValue={defaultFollowUp} className="input h-8 flex-1 text-xs" title="Next follow-up" />
          <Link href={`/acquire?sellerId=${nextId}`} className="btn-primary whitespace-nowrap text-sm">Next →</Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {canUpdateSeller ? (
          <form action={statusAction} className="flex items-center gap-2">
            <select name="outreachStatus" defaultValue={outreachStatus} className="input h-8 text-xs">
              {OUTREACH_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{outreachStatusLabel(s)}</option>
              ))}
            </select>
            <button type="submit" className="btn text-xs">Set status</button>
          </form>
        ) : null}
        {promote ? (
          <Link className="btn text-xs" href={promote.href}>
            <Icon name="pipeline" className="h-3.5 w-3.5" />
            {promote.label}
          </Link>
        ) : null}
        <span className="ml-auto text-[11px] text-slate-400">
          <kbd className="rounded bg-slate-100 px-1">j</kbd>/<kbd className="rounded bg-slate-100 px-1">k</kbd> next/prev
        </span>
      </div>
    </div>
  );
}
