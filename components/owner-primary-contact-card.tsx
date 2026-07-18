import Link from "next/link";

export type OwnerPrimaryContactView = {
  ownerId: string;
  ownerName: string;
  label?: string | null;
  contactName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  mailingAddress?: string | null;
  notes?: string | null;
};

export function OwnerPrimaryContactCard({
  title = "Owner primary contact",
  owner,
}: {
  title?: string;
  owner: OwnerPrimaryContactView | null;
}) {
  return (
    <article className="card p-6">
      <p className="eyebrow">{title}</p>
      {!owner ? (
        <p className="mt-3 text-sm text-slate-400">No primary owner contact stored.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <Link href={`/owners/${owner.ownerId}`} className="text-sm font-semibold text-brand-700 hover:underline">
              {owner.ownerName}
            </Link>
            <p className="mt-1 text-xs text-slate-500">
              {[owner.contactName, owner.label, owner.company].filter(Boolean).join(" · ") || "Primary owner contact"}
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{owner.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Phone</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{owner.phone ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Mailing address</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{owner.mailingAddress ?? "—"}</dd>
            </div>
          </dl>
          {owner.notes ? (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">Notes</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{owner.notes}</p>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
