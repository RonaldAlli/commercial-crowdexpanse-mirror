import { redirect } from "next/navigation";

import { Icon } from "@/components/icons";
import { LoginForm } from "@/components/login-form";
import { readSessionToken } from "@/lib/auth";

const highlights = [
  { label: "Pipeline coverage", value: "13 stages from lead to paid" },
  { label: "Asset support", value: "Multifamily through land, built for expansion" },
  { label: "MVP boundary", value: "Acquisitions only. No external portals yet." },
];

export default function LoginPage() {
  if (readSessionToken()) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(600px circle at 15% 15%, rgba(58,87,234,0.35), transparent 45%), radial-gradient(500px circle at 85% 90%, rgba(37,64,200,0.25), transparent 40%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 shadow-lg">
            <Icon name="properties" className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">CrowdExpanse</p>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-brand-300">
              Commercial
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Commercial acquisitions, underwritten and moved to close in one operating system.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            A greenfield internal platform for seller pursuit, underwriting, buyer matching, and
            transaction execution.
          </p>

          <dl className="mt-10 space-y-4">
            {highlights.map((h) => (
              <div key={h.label} className="flex gap-3 border-l-2 border-brand-500/60 pl-4">
                <div>
                  <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-brand-300">
                    {h.label}
                  </dt>
                  <dd className="mt-0.5 text-sm text-slate-200">{h.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-slate-500">
          © CrowdExpanse Commercial · Internal acquisitions platform
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center bg-white px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Icon name="properties" className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900">CrowdExpanse Commercial</p>
            </div>
          </div>

          <p className="eyebrow">Operator access</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
            Sign in to the workspace
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Enter your CrowdExpanse Commercial credentials to access the acquisitions workspace.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
