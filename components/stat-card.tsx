import Link from "next/link";

import { HardLink } from "@/components/hard-link";

export function StatCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="metric mt-3 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{detail}</p>
    </>
  );

  return href ? (
    href === "/opportunities" ? (
      <HardLink
        href={href}
        className="card block rounded-2xl p-5 transition-shadow hover:shadow-md focus:outline-none focus:ring-4 focus:ring-brand-500/10"
      >
        {content}
      </HardLink>
    ) : (
      <Link
        href={href}
        className="card block rounded-2xl p-5 transition-shadow hover:shadow-md focus:outline-none focus:ring-4 focus:ring-brand-500/10"
      >
        {content}
      </Link>
    )
  ) : (
    <article className="card p-5 transition-shadow hover:shadow-md">
      {content}
    </article>
  );
}
