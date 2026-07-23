import type { AcquisitionChannel } from "@prisma/client";

// Presentation for the Layer-1 acquisition CHANNEL taxonomy. The Prisma enum
// `AcquisitionChannel` is the governed source of truth; this only supplies grouped
// labels + validation for the UI/import. See docs/architecture/ATTRIBUTION_PRINCIPLES.md.
export type ChannelOption = { value: AcquisitionChannel; label: string };

export const COMMERCIAL_CHANNELS: ChannelOption[] = [
  { value: "OWNER_DIRECT", label: "Owner direct" },
  { value: "COMMERCIAL_BROKER", label: "Commercial broker" },
  { value: "CREXI", label: "Crexi" },
  { value: "LOOPNET", label: "LoopNet" },
  { value: "COSTAR", label: "CoStar" },
  { value: "COUNTY_RECORDS", label: "County records" },
  { value: "TAX_DELINQUENT", label: "Tax delinquent" },
  { value: "BANK_SPECIAL_SERVICER", label: "Bank / special servicer" },
  { value: "RECEIVERSHIP", label: "Receivership" },
  { value: "AUCTION", label: "Auction" },
  { value: "REFERRAL", label: "Referral" },
  { value: "OUTBOUND_CALLING", label: "Outbound calling" },
  { value: "DIRECT_MAIL", label: "Direct mail" },
  { value: "EMAIL_OUTREACH", label: "Email outreach" },
  { value: "WEB_INBOUND", label: "Web inbound" },
];

export const DEALFLOW_CHANNELS: ChannelOption[] = [
  { value: "DEALFLOW_PROBATE", label: "DealFlow — Probate" },
  { value: "DEALFLOW_FSBO", label: "DealFlow — FSBO" },
  { value: "DEALFLOW_EXPIRED", label: "DealFlow — Expired" },
  { value: "DEALFLOW_VACANT", label: "DealFlow — Vacant" },
  { value: "DEALFLOW_PREFORECLOSURE", label: "DealFlow — Pre-foreclosure" },
  { value: "DEALFLOW_TAX_DELINQUENT", label: "DealFlow — Tax delinquent" },
  { value: "DEALFLOW_REFERRAL", label: "DealFlow — Referral" },
];

/** Grouped for an optgroup'd <select>. */
export const CHANNEL_GROUPS: { label: string; options: ChannelOption[] }[] = [
  { label: "Commercial", options: COMMERCIAL_CHANNELS },
  { label: "Residential / DealFlow", options: DEALFLOW_CHANNELS },
];

const ALL_CHANNELS = [...COMMERCIAL_CHANNELS, ...DEALFLOW_CHANNELS];
const VALID = new Set<string>(ALL_CHANNELS.map((c) => c.value));

export function isAcquisitionChannel(value: string): value is AcquisitionChannel {
  return VALID.has(value);
}

export function channelLabel(value: AcquisitionChannel): string {
  return ALL_CHANNELS.find((c) => c.value === value)?.label ?? value;
}

// The three retained attribution layers, as carried on a lead and copied onto derived objects.
export type LeadAttribution = {
  acquisitionChannel: AcquisitionChannel | null;
  acquisitionCampaign: string | null;
  acquisitionEventKey: string | null;
};

/**
 * Retain-by-value: the attribution an Opportunity inherits from its originating lead AT CREATION.
 * A pure copy (null-safe: no lead → all null = UNKNOWN). The caller writes this once, at create, and
 * never again — attribution is historical, never re-derived when the lead later changes (AC-ATTR-5).
 */
export function opportunityAttributionFromSeller(seller: Partial<LeadAttribution> | null): LeadAttribution {
  return {
    acquisitionChannel: seller?.acquisitionChannel ?? null,
    acquisitionCampaign: seller?.acquisitionCampaign ?? null,
    acquisitionEventKey: seller?.acquisitionEventKey ?? null,
  };
}
