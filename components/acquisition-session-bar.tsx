"use client";

import { useEffect, useState, useTransition } from "react";

import { Icon } from "@/components/icons";
import { formatElapsed, DEFAULT_SESSION_GOAL } from "@/lib/acquisition-session";
import { startAcquisitionSession, endAcquisitionSession } from "@/app/(workspace)/acquire/session-actions";

export type ActiveSessionView = {
  goalCalls: number;
  completed: number;
  remaining: number;
  appointments: number;
  qualified: number;
  callsPerHour: number | null;
  goalReached: boolean;
  startedAtMs: number;
};

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "brand" | "emerald" | "slate" }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "brand" ? "text-brand-700" : "text-slate-900";
  return (
    <div className="min-w-[64px]">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

/** The session bar: turns /acquire into "working a calling session". Counters are server-derived from facts;
 *  only the elapsed clock ticks client-side. Start when idle; live stats + End when a session is open. */
export function AcquisitionSessionBar({ active }: { active: ActiveSessionView | null }) {
  const [pending, start] = useTransition();

  if (!active) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => { await startAcquisitionSession(fd); });
        }}
        className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-5 py-3"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">
          <Icon name="phone" className="h-4 w-4" />
        </span>
        <div className="mr-auto">
          <p className="text-sm font-semibold text-slate-900">Start an acquisition session</p>
          <p className="text-xs text-slate-500">Set a call goal and work the queue as one focused block.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Goal
          <input name="goalCalls" type="number" min={1} max={1000} defaultValue={DEFAULT_SESSION_GOAL} className="input h-9 w-20 text-sm" />
          <span className="text-slate-400">calls</span>
        </label>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Starting…" : "Start session"}
        </button>
      </form>
    );
  }

  return <ActiveBar active={active} pending={pending} onEnd={() => start(async () => { await endAcquisitionSession(); })} />;
}

function ActiveBar({ active, pending, onEnd }: { active: ActiveSessionView; pending: boolean; onEnd: () => void }) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(0));
  useEffect(() => {
    const tick = () => setElapsed(formatElapsed(Date.now() - active.startedAtMs));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active.startedAtMs]);

  const pct = active.goalCalls > 0 ? Math.min(100, Math.round((active.completed / active.goalCalls) * 100)) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${active.goalReached ? "bg-emerald-600" : "bg-brand-600"}`}>
            <Icon name={active.goalReached ? "check" : "phone"} className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{active.goalReached ? "Goal reached" : "Session in progress"}</p>
            <p className="text-xs text-slate-500">{active.callsPerHour != null ? `${active.callsPerHour} calls/hr` : "warming up…"}</p>
          </div>
        </div>

        <Stat label="Goal" value={active.goalCalls} />
        <Stat label="Completed" value={active.completed} tone="brand" />
        <Stat label="Remaining" value={active.remaining} />
        <Stat label="Elapsed" value={elapsed} />
        <Stat label="Appointments" value={active.appointments} tone="emerald" />
        <Stat label="Qualified" value={active.qualified} tone="emerald" />

        <button type="button" onClick={onEnd} disabled={pending} className="btn ml-auto text-sm">
          {pending ? "Ending…" : "End session"}
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${active.goalReached ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
