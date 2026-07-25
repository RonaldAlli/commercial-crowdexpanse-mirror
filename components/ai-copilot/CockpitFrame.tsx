"use client";

// Wraps the session cockpit's fixed multi-pane region so its RIGHT edge yields to
// the Copilot column (open → width, closed → rail). This is the one place the fixed
// cockpit layout reacts to Copilot state; the panes stay fully visible, just narrower.

import type { ReactNode } from "react";

import { useCopilot } from "./CopilotProvider";
import { COPILOT_RAIL_WIDTH } from "./CopilotRegion";

export function CockpitFrame({ children }: { children: ReactNode }) {
  const { open, width } = useCopilot();
  const right = open ? width : COPILOT_RAIL_WIDTH;
  return (
    <div
      className="fixed inset-y-0 left-[76px] flex flex-col overflow-hidden bg-slate-50"
      style={{ right }}
    >
      {children}
    </div>
  );
}
