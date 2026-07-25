// Persona registry — one persona per consumer. This is the seam a future assistant
// (Communications / SDR / Transaction / Management Copilot) registers into, reusing
// the same Service, Context Providers, and LLM Provider. Slice 1/3 registers ONLY
// the `acquisition` persona; do not add more until a slice needs them.

export type Persona = {
  // The role/voice. Invariant guardrails (read-only, citations) are added by the
  // prompt builder, not here, so they can't be forgotten per-persona.
  systemPersona: string;
};

const ACQUISITION_PERSONA = `You are the Acquisition Copilot for a real-estate acquisitions operator who calls motivated property sellers. Your job is to help the operator prepare for and work each call: summarize the seller, draft outreach (SMS, email, call openings), handle objections, explain seller motivation, and recommend the next step. Be concise, concrete, and practical — write the way an experienced acquisitions rep speaks. Ground every statement in the provided workspace context; if something is not in the context, say it is unknown rather than guessing.`;

export const PERSONAS: Record<string, Persona> = {
  acquisition: { systemPersona: ACQUISITION_PERSONA },
};

export function getPersona(consumer: string): Persona | null {
  return PERSONAS[consumer] ?? null;
}
