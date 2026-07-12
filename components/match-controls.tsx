"use client";

import { useTransition } from "react";

import { generateMatches, updateMatchStatus, deleteMatch } from "@/app/(workspace)/matches/actions";
import { MATCH_STATUS_OPTIONS } from "@/lib/match-options";

/** Header button that scores every org buyer against this opportunity. */
export function GenerateMatchesButton({ opportunityId }: { opportunityId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={pending}
      onClick={() => start(async () => {
        await generateMatches(opportunityId);
      })}
    >
      {pending ? "Finding…" : "Find matching buyers"}
    </button>
  );
}

/**
 * Per-row status dropdown + remove control for one buyer match. The Remove
 * control is hidden unless `canRemove` (server-decided from the caller's role);
 * deleteMatch is still authorized server-side regardless.
 */
export function MatchRowControls({
  matchId,
  current,
  canRemove = false,
}: {
  matchId: string;
  current: string;
  canRemove?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <select
        defaultValue={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await updateMatchStatus(matchId, next);
          });
        }}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-50"
      >
        {MATCH_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {canRemove ? (
        <button
          type="button"
          className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
          disabled={pending}
          onClick={() => start(async () => {
            await deleteMatch(matchId);
          })}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}
