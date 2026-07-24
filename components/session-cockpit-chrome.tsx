"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";

import { Icon } from "@/components/icons";
import { pauseAcquisitionSession, exitCockpit, endAcquisitionSession } from "@/app/(workspace)/acquire/session-actions";

// The chrome that REPLACES the normal workspace shell while an acquisition session is running: no sidebar,
// no general navigation — just a slim session bar with the three escape controls (Pause / Exit / End) and a
// full-width canvas for the cockpit. The software gets out of the way; the operator works the calling block.
export function SessionCockpitChrome({ children }: { children: ReactNode }) {
  const [pending, start] = useTransition();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5 text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500">
          <Icon name="phone" className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tracking-wide">CALLING SESSION</span>
        <span className="hidden text-xs text-slate-400 sm:inline">· focus mode — the queue is working you</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await pauseAcquisitionSession(); })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            <span aria-hidden className="text-xs">❚❚</span> Pause
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await exitCockpit(); })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
            title="Leave the cockpit without ending — the session is preserved"
          >
            <Icon name="arrowUpRight" className="h-4 w-4" /> Exit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await endAcquisitionSession(); })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium hover:bg-rose-500 disabled:opacity-50"
          >
            <Icon name="check" className="h-4 w-4" /> End session
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
