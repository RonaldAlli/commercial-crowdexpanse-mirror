"use client";

import { useState, useTransition } from "react";

import { updateMemberRole } from "@/app/(workspace)/settings/team/actions";
import { ROLE_OPTIONS } from "@/lib/user-options";

/** Per-row role dropdown for one org member. Surfaces guard errors inline. */
export function MemberRoleSelect({
  userId,
  current,
  disabled = false,
}: {
  userId: string;
  current: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={value}
        disabled={pending || disabled}
        onChange={(e) => {
          const next = e.target.value;
          const previous = value;
          setValue(next);
          setError(null);
          start(async () => {
            const result = await updateMemberRole(userId, next);
            if (result?.error) {
              setValue(previous); // revert on rejection (e.g. last-admin guard)
              setError(result.error);
            }
          });
        }}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-50"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
