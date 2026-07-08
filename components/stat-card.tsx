export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="card p-5 transition-shadow hover:shadow-md">
      <p className="eyebrow">{label}</p>
      <p className="metric mt-3 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{detail}</p>
    </article>
  );
}
