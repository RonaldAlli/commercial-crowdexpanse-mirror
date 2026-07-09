"use client";

import { useState, useTransition } from "react";

import { acceptInvite } from "@/app/invite/[token]/actions";
import { Icon } from "@/components/icons";

export function AcceptInviteForm({
  token,
  email,
  orgName,
  roleName,
}: {
  token: string;
  email: string;
  orgName: string;
  roleName: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const name = String(fd.get("name") ?? "");
        const password = String(fd.get("password") ?? "");
        setError(null);
        start(async () => {
          // On success the action redirects; only errors return here.
          const res = await acceptInvite(token, name, password);
          if (res?.error) setError(res.error);
        });
      }}
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
        <p className="text-slate-500">
          Joining <span className="font-medium text-slate-900">{orgName}</span> as{" "}
          <span className="font-medium text-slate-900">{roleName}</span>
        </p>
        <p className="mt-0.5 text-slate-500">{email}</p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Your name</span>
        <input className="input" name="name" type="text" autoComplete="name" required />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Set a password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="mt-1 block text-xs text-slate-400">At least 8 characters.</span>
      </label>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      <button className="btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
        <Icon name="arrowUpRight" className="h-4 w-4" />
      </button>
    </form>
  );
}
