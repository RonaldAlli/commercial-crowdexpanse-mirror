// Structured, deduplicated source model for the authoritative "Sources" panel.
//
// The Brain emits provenance as structured data (SourceListEntry[] → SourceRef[]);
// this pure layer flattens it into distinct DisplaySource items for the UI to render
// however it likes — never formatted strings. Repeated references to the same
// underlying item (e.g. the seller appearing across fragments) are collapsed into one
// entry that preserves its association to every [S#] label that cited it.
//
// Pure + type-only imports → client-safe and unit-testable.

import type { SourceRefKind } from "@/lib/ai/context/types";
import type { SourceListEntry } from "@/lib/ai/brain/prompt";

export type DisplaySource = {
  dedupeKey: string; // internal identity used to merge duplicates
  kind: SourceRefKind; // source type
  entityId?: string; // entity identifier, when the ref points at a specific record
  anchor?: string; // stable UI handle back to the workspace item
  label: string; // human-readable snippet
  citations: string[]; // the [S#] labels that reference this item (association preserved)
};

export function buildDisplaySources(sources: SourceListEntry[]): DisplaySource[] {
  const byKey = new Map<string, DisplaySource>();
  for (const entry of sources) {
    for (const ref of entry.refs) {
      const dedupeKey = `${ref.kind}::${ref.id ?? ""}::${ref.anchor ?? ""}::${ref.snippet}`;
      const existing = byKey.get(dedupeKey);
      if (existing) {
        if (!existing.citations.includes(entry.label)) existing.citations.push(entry.label);
      } else {
        byKey.set(dedupeKey, {
          dedupeKey,
          kind: ref.kind,
          entityId: ref.id,
          anchor: ref.anchor,
          label: ref.snippet,
          citations: [entry.label],
        });
      }
    }
  }
  return Array.from(byKey.values());
}
