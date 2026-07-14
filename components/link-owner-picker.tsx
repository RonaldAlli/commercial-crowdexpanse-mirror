import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { listQueryString } from "@/lib/list-params";

// Shared owner picker for the Seller/Property sides of linking (Commit 1d-2a).
// Server component (no client state): lists existing owners and attaches the
// current record to one. Link-to-existing-only — owner creation stays the
// dedicated /owners/new flow. Attaching when already linked is a MOVE.

type OwnerRow = { id: string; displayName: string; entityType: string };

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function LinkOwnerPicker({
  recordName,
  basePath,
  redirectTo,
  action,
  recordField,
  recordId,
  currentOwnerId,
  owners,
  q,
  hasQuery,
  page,
  pages,
}: {
  recordName: string;
  basePath: string; // e.g. /sellers/<id>/link-owner
  redirectTo: string; // where to return after attach
  action: (formData: FormData) => Promise<void>;
  recordField: "sellerId" | "propertyId";
  recordId: string;
  currentOwnerId: string | null;
  owners: OwnerRow[];
  q: string;
  hasQuery: boolean;
  page: number;
  pages: number;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow={`Link owner`}
        title={`Owner for ${recordName}`}
        description={currentOwnerId ? "This record is already linked — attaching another owner will move it." : "Attach this record to a canonical owner."}
      />

      <form className="flex items-center gap-2" action={basePath}>
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" name="q" defaultValue={hasQuery ? q : ""} placeholder="Search owners…" />
        </div>
        <button className="btn-ghost" type="submit">Search</button>
      </form>

      {owners.length === 0 ? (
        <EmptyState icon="buyers" title="No owners found" description={hasQuery ? "Try a different search." : "Create an owner first."} action={<Link className="btn-primary" href="/owners/new">New owner</Link>} />
      ) : (
        <div className="card divide-y divide-slate-100">
          {owners.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{o.displayName}</p>
                <p className="truncate text-xs text-slate-400">{titleCase(o.entityType)}</p>
              </div>
              {o.id === currentOwnerId ? (
                <Badge tone="success" dot>Linked</Badge>
              ) : (
                <form action={action}>
                  <input type="hidden" name="ownerId" value={o.id} />
                  <input type="hidden" name={recordField} value={recordId} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button className="btn-primary" type="submit">{currentOwnerId ? "Move here" : "Attach"}</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link className="btn-ghost" href={`${basePath}${listQueryString({ q: hasQuery ? q : undefined, page: page - 1 })}`}>Previous</Link> : null}
            {page < pages ? <Link className="btn-ghost" href={`${basePath}${listQueryString({ q: hasQuery ? q : undefined, page: page + 1 })}`}>Next</Link> : null}
          </div>
        </div>
      ) : null}

      <Link className="btn-ghost" href={redirectTo}>← Back</Link>
    </div>
  );
}
