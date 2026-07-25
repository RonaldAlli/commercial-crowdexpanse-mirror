// Composable context providers for the AI Copilot (Slice 2).
//
// Each provider wraps ONE existing read-model and returns a labeled ContextFragment
// (or null when it has nothing to contribute). The Workspace Brain (Slice 3) selects
// a subset of providers per question — retrieval, not a monolith. Org + actor always
// come from the caller's session (ProviderCtx.user), never from request input.

import type { CurrentUser } from "@/lib/auth";

export type SourceRefKind =
  | "seller"
  | "property"
  | "timeline"
  | "session"
  | "communication"
  | "scoring";

// Provenance a citation points back to. `anchor` is a stable handle the UI can use
// to link a claim to the workspace item it came from.
export type SourceRef = {
  kind: SourceRefKind;
  id?: string;
  anchor?: string;
  snippet: string;
};

export type ContextFragment = {
  key: string; // provider key (e.g. "seller")
  label: string; // display label (e.g. "Seller")
  text: string; // compact text handed to the model
  sourceRefs: SourceRef[];
};

export type ProviderCtx = {
  user: CurrentUser; // org (and actor) ALWAYS from the session — never request input
  subjectId: string; // the seller id
};

export interface ContextProvider {
  key: string;
  load(ctx: ProviderCtx): Promise<ContextFragment | null>;
}
