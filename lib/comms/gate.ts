import type { CommsChannel } from "@prisma/client";

// Compliance gate — the single place every outbound comms path must consult before contacting a seller.
// Reuses the existing Seller opt-out flags; DO_NOT_CONTACT / DEAD block every channel. Pure + unit-tested.
export type SellerContactFlags = {
  outreachStatus: string; // ContactOutreachStatus
  doNotCall: boolean;
  doNotText: boolean;
  doNotEmail: boolean;
  badPhone: boolean;
  badEmail: boolean;
  phone: string | null;
  email: string | null;
};

export type GateResult = { allowed: boolean; reason?: string };

/** Voice uses "PHONE"; SMS/WhatsApp are phone-based; Email is email-based. */
export function commsGate(flags: SellerContactFlags, channel: "PHONE" | CommsChannel): GateResult {
  if (flags.outreachStatus === "DO_NOT_CONTACT") return { allowed: false, reason: "Seller is Do Not Contact" };
  if (flags.outreachStatus === "DEAD") return { allowed: false, reason: "Seller is marked Dead" };

  switch (channel) {
    case "PHONE":
      if (flags.doNotCall) return { allowed: false, reason: "Do-not-call flag is set" };
      if (flags.badPhone) return { allowed: false, reason: "Phone number is marked bad" };
      if (!flags.phone) return { allowed: false, reason: "No phone number on file" };
      return { allowed: true };
    case "SMS":
    case "WHATSAPP":
      if (flags.doNotText) return { allowed: false, reason: "Do-not-text flag is set" };
      if (flags.badPhone) return { allowed: false, reason: "Phone number is marked bad" };
      if (!flags.phone) return { allowed: false, reason: "No phone number on file" };
      return { allowed: true };
    case "EMAIL":
      if (flags.doNotEmail) return { allowed: false, reason: "Do-not-email flag is set" };
      if (flags.badEmail) return { allowed: false, reason: "Email is marked bad" };
      if (!flags.email) return { allowed: false, reason: "No email on file" };
      return { allowed: true };
  }
}
