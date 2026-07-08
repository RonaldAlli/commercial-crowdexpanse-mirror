"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Icon } from "@/components/icons";
import { loginAction } from "@/app/login/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Securing workspace…" : "Enter workspace"}
      {!pending ? <Icon name="arrowUpRight" className="h-4 w-4" /> : null}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          placeholder="you@commercial.crowdexpanse.com"
          autoComplete="email"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
