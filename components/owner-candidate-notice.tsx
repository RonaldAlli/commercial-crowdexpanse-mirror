import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { OwnerCandidateView } from "@/app/(workspace)/owners/actions";

// Create-time duplicate warning. A CANDIDATE is a proposal — "these may be the
// same owner" — never a merge (Volume 12: "candidate ≠ merge"). It offers no
// link/merge action; it only informs, so the user can review before creating.
const REASON_LABEL: Record<string, string> = {
  "exact-match-key": "Same normalized name",
  "alias-match": "Matches a known alias",
};

export function OwnerCandidateNotice({ candidates }: { candidates: OwnerCandidateView[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-800">Possible duplicate owner{candidates.length > 1 ? "s" : ""}</p>
      <p className="mt-0.5 text-xs text-amber-700">
        These existing owners may be the same party. Review before creating a new record — or open one instead. Creating anyway will not link them.
      </p>
      <ul className="mt-2 space-y-1.5">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-3 py-1.5 text-sm">
            <Link href={`/owners/${c.id}`} className="font-medium text-slate-700 hover:text-brand-700">
              {c.displayName}
            </Link>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              {REASON_LABEL[c.reason] ?? c.reason}
              <Badge tone="info">{Math.round(c.identityConfidence * 100)}% match</Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
