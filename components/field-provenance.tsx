import { Badge } from "@/components/ui/badge";

// Per-field provenance display (v1.2). Presentation mirrors the architecture —
// Projected Value → Winning Signal → Signal History (Projection → Signal →
// Observation). Pure consumer: it reads projected values + the ledger read API
// (getFieldProvenance); it never influences them (Projection ≠ Presentation). No
// client state — every render reflects the current ledger.
//
// Entity-agnostic by construction: nothing here references a specific entity. It
// was generalized from the Owner-only component once Property became a second real
// consumer (v1.2 Commit 2b) — see the Engineering Playbook rule "generalize only
// after a second real consumer exists". Both Owner and Property detail pages render
// it; the field label + values are props.

type AcceptedSignal = {
  value: string;
  sourceCategory: string;
  sourceId: string;
  asOf: Date;
  confidence: number;
  isOverride: boolean;
};

export type FieldProvenance = { accepted: AcceptedSignal[]; supersededCount: number; total: number };

const CATEGORY_TONE: Record<string, "brand" | "info" | "neutral" | "success"> = {
  USER_ENTERED: "brand",
  LICENSED: "info",
  PUBLIC: "neutral",
  CALCULATION: "success",
};

function fmtDate(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

export function FieldProvenanceCard({
  fieldLabel,
  projectedValue,
  provenance,
  canWrite,
  clearAction,
}: {
  fieldLabel: string;
  projectedValue: string;
  provenance: FieldProvenance;
  canWrite: boolean;
  /** Bound server action to clear an active override, if one is present + writable. */
  clearAction?: () => Promise<void>;
}) {
  // The winning signal is the accepted one whose value is what got projected.
  const winner = provenance.accepted.find((s) => s.value === projectedValue) ?? provenance.accepted[0];
  const others = provenance.accepted.filter((s) => s !== winner);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{fieldLabel}</p>
        <span className="text-xs text-slate-400">{provenance.total} signal{provenance.total === 1 ? "" : "s"}</span>
      </div>

      {/* Projected Value */}
      <p className="mt-1 text-lg font-semibold text-slate-900">{projectedValue || "—"}</p>

      {/* Winning Signal */}
      {winner ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Badge tone={CATEGORY_TONE[winner.sourceCategory] ?? "neutral"}>{winner.sourceCategory}</Badge>
          <span>via {winner.sourceId}</span>
          <span>· as of {fmtDate(winner.asOf)}</span>
          <span>· {Math.round(winner.confidence * 100)}% confidence</span>
          {winner.isOverride ? <Badge tone="warning">Pinned override</Badge> : null}
          {winner.isOverride && canWrite && clearAction ? (
            <form action={clearAction}>
              <button type="submit" className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline">
                Clear pin
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">No signals yet.</p>
      )}

      {/* Signal History */}
      {(others.length > 0 || provenance.supersededCount > 0) ? (
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <p className="font-medium text-slate-500">Signal history</p>
          <ul className="mt-1 space-y-1">
            {others.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge tone={CATEGORY_TONE[s.sourceCategory] ?? "neutral"}>{s.sourceCategory}</Badge>
                <span className="text-slate-600">{s.value}</span>
                <span>· {fmtDate(s.asOf)}</span>
              </li>
            ))}
            {provenance.supersededCount > 0 ? (
              <li className="text-slate-400">{provenance.supersededCount} superseded signal{provenance.supersededCount === 1 ? "" : "s"} (retained in the ledger)</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
