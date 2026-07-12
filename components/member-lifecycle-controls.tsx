"use client";

import { useState, useTransition } from "react";

import { deactivateMember, reactivateMember } from "@/app/(workspace)/settings/team/actions";

/**
 * Deactivate / reactivate control for one org member. Hidden for the current
 * user (self-deactivation is never allowed). Server-side guards (last-active-
 * admin, MANAGE TEAM) are authoritative; any rejection is surfaced inline.
 */
export function MemberLifecycleControls({
  userId,
  isSelf,
  deactivated,
}: {
  userId: string;
  isSelf: boolean;
  deactivated: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isSelf) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = deactivated ? await reactivateMember(userId) : await deactivateMember(userId);
            if (res?.error) setError(res.error);
          })
        }
        className={`text-xs font-medium hover:underline disabled:opacity-50 ${
          deactivated ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {pending ? "…" : deactivated ? "Reactivate" : "Deactivate"}
      </button>
      {error ? <span className="text-right text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
