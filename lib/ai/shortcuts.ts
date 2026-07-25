// Shortcut catalog — the SINGLE source of truth for the Copilot's one-click prompts.
// The Brain derives its intent→provider map from here (lib/ai/brain/intent.ts) and
// the UI renders its buttons from here (components/ai-copilot). A shortcut is a
// product feature, not a UI button: a stable `id` (used later for telemetry), a
// display `label`, the default `prompt` sent when clicked, and its associated intent
// (`providers` — the context to retrieve). Every shortcut includes the "seller"
// anchor. This file is pure data (client-safe — no server-only imports).

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

export type CopilotShortcut = {
  id: ShortcutId; // stable identifier — also the intent id; telemetry-ready
  label: string; // button text
  prompt: string; // default question sent when the shortcut is clicked
  providers: string[]; // associated intent → context providers to retrieve
};

export const COPILOT_SHORTCUTS: readonly CopilotShortcut[] = [
  {
    id: "summarize-seller",
    label: "Summarize seller",
    prompt: "Summarize everything I need to know about this seller before I call.",
    providers: ["seller", "timeline"],
  },
  {
    id: "prepare-for-call",
    label: "Prepare me for this call",
    prompt: "Prepare me for this call — what should I know, and what should I lead with?",
    providers: ["seller", "property", "session", "timeline", "scoring"],
  },
  {
    id: "draft-sms",
    label: "Draft SMS",
    prompt: "Draft a short, friendly SMS to this seller.",
    providers: ["seller", "communications"],
  },
  {
    id: "draft-email",
    label: "Draft email",
    prompt: "Draft a follow-up email to this seller.",
    providers: ["seller", "communications", "timeline"],
  },
  {
    id: "write-opening",
    label: "Write call opening",
    prompt: "Write a strong opening for my call with this seller.",
    providers: ["seller", "property", "scoring"],
  },
  {
    id: "handle-objection",
    label: "Handle objection",
    prompt: "How should I handle this seller's most likely objection?",
    providers: ["seller", "timeline", "scoring"],
  },
  {
    id: "explain-motivation",
    label: "Explain motivation",
    prompt: "What is this seller's likely motivation to sell?",
    providers: ["seller", "timeline", "communications"],
  },
  {
    id: "recommend-next-step",
    label: "Recommend next step",
    prompt: "What is my recommended next step with this seller?",
    providers: ["seller", "session", "timeline", "scoring"],
  },
  {
    id: "generate-call-summary",
    label: "Generate call summary",
    prompt: "Draft a structured summary of my call with this seller (I will review and save it myself).",
    providers: ["seller", "timeline", "session", "communications"],
  },
];
