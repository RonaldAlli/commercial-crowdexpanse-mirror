"use client";

import { useState, useTransition } from "react";

import { createInvite, revokeInvite } from "@/app/(workspace)/settings/team/actions";
import { ROLE_OPTIONS } from "@/lib/user-options";

/** Admin control: invite a teammate and reveal the copy-link exactly once. */
export function InviteForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const email = String(fd.get("email") ?? "");
          const role = String(fd.get("role") ?? "");
          setError(null);
          setLink(null);
          setCopied(false);
          start(async () => {
            const res = await createInvite(email, role);
            if (res.error) {
              setError(res.error);
              return;
            }
            if (res.token) {
              setLink(`${window.location.origin}/invite/${res.token}`);
              form.reset();
            }
          });
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Email
          <input
            className="input h-9 py-0 text-sm"
            name="email"
            type="email"
            placeholder="teammate@example.com"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Role
          <select name="role" defaultValue="ACQUISITIONS" className="input h-9 w-44 py-0 text-sm">
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Creating…" : "Create invite link"}
        </button>
      </form>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      {link ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-xs font-medium text-emerald-800">
            Invite link created — copy it now. It won&apos;t be shown again; revoke and reissue if lost.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="input h-8 flex-1 py-0 font-mono text-xs"
            />
            <button
              type="button"
              className="btn-ghost h-8 shrink-0"
              onClick={() => {
                navigator.clipboard?.writeText(link).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Revoke a single pending invitation. */
export function RevokeInviteButton({ invitationId }: { invitationId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await revokeInvite(invitationId);
            if (res?.error) setError(res.error);
          })
        }
      >
        Revoke
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
