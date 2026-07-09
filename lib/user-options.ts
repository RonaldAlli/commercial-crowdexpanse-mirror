import { UserRole } from "@prisma/client";

import type { Tone } from "@/components/ui/badge";

// Selectable roles (mirrors the UserRole enum order: ADMIN first).
export const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.ACQUISITIONS, label: "Acquisitions" },
  { value: UserRole.ANALYST, label: "Analyst" },
  { value: UserRole.DISPOSITIONS, label: "Dispositions" },
];

const LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label]),
);

export function roleLabel(role: string): string {
  return LABELS[role] ?? role;
}

export function roleTone(role: string): Tone {
  return role === UserRole.ADMIN ? "brand" : "neutral";
}
