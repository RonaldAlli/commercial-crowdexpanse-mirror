"use client";

import { useId, useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";
import { Badge, type Tone } from "@/components/ui/badge";

/**
 * A single accessible accordion section for the Closing Center container (v1.4, Option C).
 * PRESENTATION ONLY: it manages nothing but its own local open/closed state (useState) and
 * never touches the server — opening or collapsing performs NO data fetch or write. Its
 * children (the existing self-contained domain cards) are always mounted and merely hidden
 * when collapsed, so each card keeps its own local state across toggles.
 *
 * Accessibility: a real <button> trigger with aria-expanded + aria-controls; a labelled
 * region panel with a stable id and `hidden` when collapsed; a visible focus ring; and the
 * status conveyed as TEXT (a badge label + an sr-only phrase), never by color/icon alone.
 */
export function AccordionSection({
  title,
  status,
  statusTone = "neutral",
  defaultOpen = false,
  children,
}: {
  title: string;
  status: string;
  statusTone?: Tone;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const base = useId();
  const triggerId = `${base}-trigger`;
  const panelId = `${base}-panel`;

  return (
    <div className="accordion-section">
      <h3 className="m-0">
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
        >
          <span className="flex items-center gap-3">
            <Icon
              name="chevronRight"
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <span className="text-base font-semibold text-slate-900">{title}</span>
          </span>
          <span className="flex items-center gap-2">
            <Badge tone={statusTone}>{status}</Badge>
            <span className="sr-only">{`${title} status: ${status}. ${open ? "Section expanded." : "Section collapsed."}`}</span>
          </span>
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
