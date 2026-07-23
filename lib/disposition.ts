import type { ContactOutreachStatus } from "@prisma/client";

// Operator-console call dispositions — the outcome buttons a rep taps after a call. Each records a
// call touch and applies a sensible side-effect (status progression / flags). Pure + unit-tested; the
// server action recordDisposition just executes what this returns.
export const DISPOSITIONS = [
  "No answer",
  "Voicemail",
  "Connected",
  "Wrong number",
  "DNC",
  "Appointment set",
] as const;

export type Disposition = (typeof DISPOSITIONS)[number];

export type DispositionEffect = {
  summary: string;
  outreachStatus?: ContactOutreachStatus; // progress / retire the lead
  badPhone?: boolean;
  doNotCall?: boolean;
};

export function isDisposition(value: string): value is Disposition {
  return (DISPOSITIONS as readonly string[]).includes(value);
}

export function dispositionEffect(disposition: Disposition): DispositionEffect {
  switch (disposition) {
    case "No answer":
      return { summary: "Call — no answer" };
    case "Voicemail":
      return { summary: "Call — left voicemail" };
    case "Connected":
      return { summary: "Call — connected", outreachStatus: "RESPONDED" };
    case "Wrong number":
      return { summary: "Call — wrong number", badPhone: true };
    case "DNC":
      return { summary: "Call — do not contact", outreachStatus: "DO_NOT_CONTACT", doNotCall: true };
    case "Appointment set":
      return { summary: "Call — appointment set", outreachStatus: "RESPONDED" };
  }
}
