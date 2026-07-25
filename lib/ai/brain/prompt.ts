// Prompt assembly — pure. Persona (per consumer) + the INVARIANT read-only and
// citation guardrails + the labeled context blocks. No model call happens here.

import type { ContextFragment, SourceRef } from "@/lib/ai/context/types";

import { getPersona } from "./persona";
import type { Intent } from "./intent";

// One entry per context fragment handed to the model, carrying the [S#] label so the
// UI can render a "Sources" list and resolve `[S#]` markers back to workspace items.
export type SourceListEntry = {
  label: string; // "S1", "S2", …
  key: string; // provider key
  providerLabel: string; // display label, e.g. "Recent timeline"
  refs: SourceRef[];
};

const READ_ONLY_GUARDRAIL =
  "You are READ-ONLY. You cannot change records, set statuses, record dispositions, " +
  "schedule callbacks or follow-ups, create tasks, or send SMS or email. You may " +
  "RECOMMEND any of these, but the operator performs every action through the app. " +
  "Never claim to have done something you cannot do; phrase actions as suggestions.";

const CITATION_INSTRUCTION =
  "Each context block below is labeled [S1], [S2], and so on. When you state a fact " +
  "drawn from the workspace, cite the label it came from — e.g. \"held the property 21 " +
  "years [S3]\". Only cite labels that appear below; never invent a source.";

export function buildSystemPrompt(
  consumer: string,
  _intent: Intent,
  fragments: ContextFragment[],
): { system: string; sources: SourceListEntry[] } {
  const persona = getPersona(consumer);
  if (!persona) {
    throw new Error(`No persona registered for consumer "${consumer}"`);
  }

  const sources: SourceListEntry[] = fragments.map((f, i) => ({
    label: `S${i + 1}`,
    key: f.key,
    providerLabel: f.label,
    refs: f.sourceRefs,
  }));

  const contextBlock =
    fragments.length > 0
      ? fragments.map((f, i) => `[S${i + 1}] ${f.label}:\n${f.text}`).join("\n\n")
      : "(no workspace context available)";

  const system = [
    persona.systemPersona,
    READ_ONLY_GUARDRAIL,
    CITATION_INSTRUCTION,
    `## Workspace context\n${contextBlock}`,
  ].join("\n\n");

  return { system, sources };
}
