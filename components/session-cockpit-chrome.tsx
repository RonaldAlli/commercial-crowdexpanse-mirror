"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icons";
import { pauseAcquisitionSession, exitCockpit, endAcquisitionSession } from "@/app/(workspace)/acquire/session-actions";

// Operator mode — the shell COLLAPSES (it isn't removed): a thin left rail keeps the operator oriented and
// never trapped (Figma / VS Code style), while the cockpit fills the canvas. Rail = a few cockpit
// destinations + the session controls (Pause · Exit · End).
const RAIL: { href: string; label: string; icon: IconName }[] = [
  { href: "/acquire", label: "Session", icon: "phone" },
  { href: "/acquire#seller", label: "Seller", icon: "sellers" },
  { href: "/acquire#queue", label: "Queue", icon: "menu" },
  { href: "/acquire#timeline", label: "Timeline", icon: "activity" },
  { href: "/settings/communications", label: "Settings", icon: "properties" },
];

function RailLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  return (
    <Link href={href} className="group flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-slate-300 hover:bg-slate-800 hover:text-white">
      <Icon name={icon} className="h-5 w-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}

export function SessionCockpitChrome({ children }: { children: ReactNode }) {
  const [pending, start] = useTransition();

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[76px] flex-col border-r border-slate-800 bg-slate-900 py-3">
        <div className="flex flex-col items-center gap-1 border-b border-slate-800 pb-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Icon name="phone" className="h-5 w-5" />
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-300">On call</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-1.5 pt-3">
          {RAIL.map((r) => <RailLink key={r.label} {...r} />)}
        </nav>

        <div className="flex flex-col gap-1.5 border-t border-slate-800 px-1.5 pt-3">
          <button type="button" disabled={pending} onClick={() => start(async () => { await pauseAcquisitionSession(); })}
            className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50">
            <span aria-hidden className="text-xs">❚❚</span><span className="text-[10px] font-medium">Pause</span>
          </button>
          <button type="button" disabled={pending} onClick={() => start(async () => { await exitCockpit(); })}
            title="Leave the cockpit without ending — the session is preserved"
            className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50">
            <Icon name="arrowUpRight" className="h-4 w-4" /><span className="text-[10px] font-medium">Exit</span>
          </button>
          <button type="button" disabled={pending} onClick={() => start(async () => { await endAcquisitionSession(); })}
            className="flex flex-col items-center gap-0.5 rounded-lg bg-rose-600/90 py-1.5 text-white hover:bg-rose-500 disabled:opacity-50">
            <Icon name="check" className="h-4 w-4" /><span className="text-[10px] font-medium">End</span>
          </button>
        </div>
      </aside>

      <main className="ml-[76px] min-h-screen px-4 py-5 lg:px-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
