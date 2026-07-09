import { TaskStatus } from "@prisma/client";

import type { Tone } from "@/components/ui/badge";
import { titleCase } from "@/lib/property-options";

export const STATUS_OPTIONS = Object.values(TaskStatus).map((value) => ({
  value,
  label: titleCase(value),
}));

export function statusLabel(status: string) {
  return titleCase(status);
}

export function taskStatusTone(status: string): Tone {
  switch (status) {
    case "COMPLETE":
      return "success";
    case "BLOCKED":
      return "danger";
    case "IN_PROGRESS":
      return "info";
    default:
      return "warning";
  }
}
