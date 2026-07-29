// CRE Operating Workspace — UI Milestone 1, Increment 1.
//
// Contract:
//   guarantees — renders an Observed / Computed / Recommended tag with an icon AND text label AND a
//     screen-reader sentence, so a recommendation can never look like an observed fact and meaning never
//     depends on color alone.
//   does NOT — classify any data element; the caller supplies the `kind`.
//   later increments supply — the actual field-by-field classification when real screens are built.

import { Icon } from "@/components/icons";
import { describeElementKind, type ElementKind } from "@/lib/workspace-ui/taxonomy";

export function TaxonomyBadge({ kind, className = "" }: { kind: ElementKind; className?: string }) {
  const d = describeElementKind(kind);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${d.toneClass} ${className}`}
      title={d.description}
    >
      <span aria-hidden="true" className="inline-flex">
        <Icon name={d.iconName} className="h-3.5 w-3.5" />
      </span>
      <span>{d.label}</span>
      <span className="sr-only">{d.srLabel}</span>
    </span>
  );
}
