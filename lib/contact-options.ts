import { ContactMethod, ContactOutreachStatus, ContactTouchType } from "@prisma/client";

// Ordered options for an outreach-status <select> (used by the seller record's qualify control).
export const OUTREACH_STATUS_OPTIONS: ContactOutreachStatus[] = [
  ContactOutreachStatus.NEW,
  ContactOutreachStatus.ATTEMPTING,
  ContactOutreachStatus.CONTACTED,
  ContactOutreachStatus.RESPONDED,
  ContactOutreachStatus.QUALIFIED,
  ContactOutreachStatus.DEAD,
  ContactOutreachStatus.DO_NOT_CONTACT,
];

const VALID_OUTREACH = new Set<string>(Object.values(ContactOutreachStatus));

export function isOutreachStatus(value: string): value is ContactOutreachStatus {
  return VALID_OUTREACH.has(value);
}

export function outreachStatusLabel(status: ContactOutreachStatus): string {
  switch (status) {
    case ContactOutreachStatus.NEW:
      return "New";
    case ContactOutreachStatus.ATTEMPTING:
      return "Attempting";
    case ContactOutreachStatus.CONTACTED:
      return "Contacted";
    case ContactOutreachStatus.RESPONDED:
      return "Responded";
    case ContactOutreachStatus.QUALIFIED:
      return "Qualified";
    case ContactOutreachStatus.DEAD:
      return "Dead";
    case ContactOutreachStatus.DO_NOT_CONTACT:
      return "Do not contact";
  }
}

export function outreachStatusTone(status: ContactOutreachStatus): "neutral" | "warning" | "info" | "success" | "danger" {
  switch (status) {
    case ContactOutreachStatus.NEW:
      return "neutral";
    case ContactOutreachStatus.ATTEMPTING:
      return "warning";
    case ContactOutreachStatus.CONTACTED:
      return "info";
    case ContactOutreachStatus.RESPONDED:
      return "success";
    case ContactOutreachStatus.QUALIFIED:
      return "success";
    case ContactOutreachStatus.DEAD:
      return "danger";
    case ContactOutreachStatus.DO_NOT_CONTACT:
      return "danger";
  }
}

export function contactMethodLabel(method: ContactMethod | null): string {
  if (!method) return "Not set";
  switch (method) {
    case ContactMethod.CALL:
      return "Call";
    case ContactMethod.TEXT:
      return "Text";
    case ContactMethod.EMAIL:
      return "Email";
    case ContactMethod.MAIL:
      return "Mail";
  }
}

export function touchTypeLabel(type: ContactTouchType): string {
  switch (type) {
    case ContactTouchType.CALL:
      return "Call";
    case ContactTouchType.TEXT:
      return "Text";
    case ContactTouchType.EMAIL:
      return "Email";
    case ContactTouchType.MAIL:
      return "Mail";
    case ContactTouchType.NOTE:
      return "Note";
  }
}
