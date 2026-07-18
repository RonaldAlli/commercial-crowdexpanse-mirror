import { ContactMethod, ContactOutreachStatus, ContactTouchType } from "@prisma/client";

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
