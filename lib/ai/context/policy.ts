// AI-data policy — which restrictable fields may enter AI context, and how.
//
// Renderers consult this BEFORE constructing context, so masking/exclusion happens
// at the boundary and raw values never reach the model. For the internal pilot this
// is a static object; Slice 2 replaces it with per-organization settings and the
// renderers do not change (the policy is injected the same way).

export type FieldRule = "allow" | "mask" | "exclude";

export type AiDataPolicy = {
  phone: FieldRule;
  email: FieldRule;
  ownerName: FieldRule;
  smsBodies: FieldRule; // SMS / WhatsApp message bodies
  emailBodies: FieldRule; // email bodies + subjects
  internalNotes: FieldRule; // free-form logged notes / touch summaries
};

export const MASK = "[redacted]";

// Signed pilot policy (Approved with Restrictions — internal pilot):
// mask phone + email, exclude internal notes, allow the rest (incl. owner name and
// message bodies). Change here, not in the renderers.
export const PILOT_AI_POLICY: AiDataPolicy = {
  phone: "mask",
  email: "mask",
  ownerName: "allow",
  smsBodies: "allow",
  emailBodies: "allow",
  internalNotes: "exclude",
};

// Apply a rule to a nullable scalar: `allow` keeps it, `mask` redacts a present
// value (absent stays absent), `exclude` drops it entirely.
export function applyRule(rule: FieldRule, value: string | null): string | null {
  if (rule === "exclude") return null;
  if (rule === "mask") return value == null ? null : MASK;
  return value;
}
