"use client";

import { useEffect, useState } from "react";

import { formatElapsed } from "@/lib/acquisition-session";

export type MissionControlView = {
  goalCalls: number;
  completed: number;
  remaining: number;
  appointments: number;
  qualified: number;
  callsPerHour: number | null;
  goalReached: boolean;
  startedAtMs: number;
};

function Metric({ label, value, big, tone }: { label: string; value: string | number; big?: boolean; tone?: "brand" | "emerald" | "white" }) {
  const color = tone === "emerald" ? "text-emerald-300" : tone === "brand" ? "text-brand-300" : "text-white";
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={`mt-1 ${big ? "text-4xl" : "text-2xl"} font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

/** Mission control — the dominant object of the cockpit. Big, glanceable session numbers. All values are
 *  server-derived from facts; only the elapsed clock ticks here. (Pacing/behind-ahead is a later slice.) */
export function SessionMissionControl({ view }: { view: MissionControlView }) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(0));
  useEffect(() => {
    const tick = () => setElapsed(formatElapsed(Date.now() - view.startedAtMs));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [view.startedAtMs]);

  const pct = view.goalCalls > 0 ? Math.min(100, Math.round((view.completed / view.goalCalls) * 100)) : 0;

  return (
    <section className="rounded-2xl bg-slate-900 px-6 py-5 text-white shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
          {view.goalReached ? "Goal reached 🎯" : "Calling session"}
        </p>
        <p className="text-sm text-slate-400">{view.callsPerHour != null ? `${view.callsPerHour} calls/hr` : "warming up…"}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-7">
        <Metric label="Goal" value={view.goalCalls} />
        <Metric label="Completed" value={view.completed} big tone="brand" />
        <Metric label="Remaining" value={view.remaining} big />
        <Metric label="Elapsed" value={elapsed} />
        <Metric label="Appointments" value={view.appointments} tone="emerald" />
        <Metric label="Qualified" value={view.qualified} tone="emerald" />
        <div className="col-span-2 sm:col-span-1 lg:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Progress</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-700">
            <div className={`h-full rounded-full ${view.goalReached ? "bg-emerald-400" : "bg-brand-400"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-400">{pct}%</p>
        </div>
      </div>
    </section>
  );
}
