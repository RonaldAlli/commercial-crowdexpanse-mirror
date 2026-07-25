// Intent resolution — DETERMINISTIC, no LLM call. A shortcut maps directly to a
// fixed provider set (the product's retrieval spec); free text uses simple keyword
// heuristics over a safe default. This is a lookup, not a planner: the Brain never
// asks a model how to interpret the request.

export const SHORTCUT_IDS = [
  "summarize-seller",
  "prepare-for-call",
  "draft-sms",
  "draft-email",
  "write-opening",
  "handle-objection",
  "explain-motivation",
  "recommend-next-step",
  "generate-call-summary",
] as const;

export type ShortcutId = (typeof SHORTCUT_IDS)[number];

export type Intent = {
  id: ShortcutId | "freeform";
  providers: string[]; // provider keys to retrieve (always includes "seller", the anchor)
};

// The product's shortcut → provider retrieval map. Every entry includes "seller"
// (the anchor whose absence means the subject is not in the caller's org → 404).
export const SHORTCUT_PROVIDERS: Record<ShortcutId, string[]> = {
  "summarize-seller": ["seller", "timeline"],
  "prepare-for-call": ["seller", "property", "session", "timeline", "scoring"],
  "draft-sms": ["seller", "communications"],
  "draft-email": ["seller", "communications", "timeline"],
  "write-opening": ["seller", "property", "scoring"],
  "handle-objection": ["seller", "timeline", "scoring"],
  "explain-motivation": ["seller", "timeline", "communications"],
  "recommend-next-step": ["seller", "session", "timeline", "scoring"],
  "generate-call-summary": ["seller", "timeline", "session", "communications"],
};

export function isShortcutId(v: string): v is ShortcutId {
  return (SHORTCUT_IDS as readonly string[]).includes(v);
}

// Free-text fallback: a safe base (seller + recent timeline) plus keyword-triggered
// providers. Deterministic; order is irrelevant since retrieval re-sorts by registry.
export function freeformProviders(question: string): string[] {
  const q = question.toLowerCase();
  const set = new Set<string>(["seller", "timeline"]);
  // Leading word-boundary + stem so prefixes match (e.g. "propert" → "property",
  // "qualif" → "qualified"); no trailing boundary, which would block those stems.
  if (/\b(sms|text|email|message|reply|respond|draft|write|say)/.test(q)) set.add("communications");
  if (/\b(motivat|why|worth|lead|qualif|fit|pursue|good)/.test(q)) set.add("scoring");
  if (/\b(propert|asset|unit|building|acre|sq ?ft|square)/.test(q)) set.add("property");
  if (/\b(session|pace|goal|remaining|progress|how many|next)/.test(q)) set.add("session");
  return Array.from(set);
}

export function resolveIntent(input: { shortcutId?: string; question: string }): Intent {
  if (input.shortcutId && isShortcutId(input.shortcutId)) {
    return { id: input.shortcutId, providers: SHORTCUT_PROVIDERS[input.shortcutId] };
  }
  return { id: "freeform", providers: freeformProviders(input.question) };
}
