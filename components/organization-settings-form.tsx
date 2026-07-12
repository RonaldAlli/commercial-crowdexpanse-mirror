"use client";

import { useState, useTransition } from "react";

import { saveOrganizationSettings } from "@/app/(workspace)/settings/organization/actions";
import { INVITE_EXPIRY_MAX_DAYS, INVITE_EXPIRY_MIN_DAYS } from "@/lib/org-settings";
import { NON_ADMIN_ROLE_OPTIONS } from "@/lib/user-options";

/** Organization identity + workspace defaults. ADMIN-only; server re-validates. */
export function OrganizationSettingsForm({
  initial,
}: {
  initial: { name: string; slug: string; inviteExpiryDays: number; defaultInviteRole: string };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSaved(false);
        start(async () => {
          const res = await saveOrganizationSettings(fd);
          if (res?.error) setError(res.error);
          else setSaved(true);
        });
      }}
    >
      <div>
        <label className="text-xs font-medium text-slate-500" htmlFor="org-name">
          Organization name
        </label>
        <input id="org-name" name="name" defaultValue={initial.name} required className="input mt-1 h-10 text-sm" />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500" htmlFor="org-slug">
          Workspace URL slug
        </label>
        <input id="org-slug" value={initial.slug} readOnly disabled className="input mt-1 h-10 bg-slate-50 text-sm text-slate-500" />
        <p className="mt-1 text-xs text-slate-400">The slug is permanent and can&apos;t be changed.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-500" htmlFor="expiry">
            Invite link expiry (days)
          </label>
          <input
            id="expiry"
            name="inviteExpiryDays"
            type="number"
            min={INVITE_EXPIRY_MIN_DAYS}
            max={INVITE_EXPIRY_MAX_DAYS}
            defaultValue={initial.inviteExpiryDays}
            required
            className="input mt-1 h-10 text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">
            Between {INVITE_EXPIRY_MIN_DAYS} and {INVITE_EXPIRY_MAX_DAYS} days.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500" htmlFor="default-role">
            Default invitation role
          </label>
          <select id="default-role" name="defaultInviteRole" defaultValue={initial.defaultInviteRole} className="input mt-1 h-10 text-sm">
            {NON_ADMIN_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Admins are only ever granted via Team Management.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {saved ? <span className="text-xs font-medium text-emerald-600">Saved.</span> : null}
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </div>
    </form>
  );
}
