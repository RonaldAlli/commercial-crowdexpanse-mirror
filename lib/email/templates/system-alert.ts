import type { RenderedEmail, Template } from "@/lib/email/types";

import { escapeHtml, wrapLayout } from "./layout";

// The reference template — the canonical example of the Template contract, and a
// genuine platform use case (operational/system notices). Feature templates
// (invitation, password_reset, digest, …) land in later slices and follow this
// exact shape: a pure (data) => RenderedEmail with a version for reproducibility.

export interface SystemAlertData {
  heading: string;
  message: string;
  orgName?: string;
}

function coerce(data: unknown): SystemAlertData {
  const d = (data ?? {}) as Partial<SystemAlertData>;
  return {
    heading: d.heading?.trim() || "System notice",
    message: d.message?.trim() || "",
    orgName: d.orgName?.trim() || undefined,
  };
}

export const systemAlertTemplate: Template = {
  version: 1,
  render(data: unknown): RenderedEmail {
    const { heading, message, orgName } = coerce(data);
    const subject = heading;
    const bodyHtml = `<p style="font-size:14px;line-height:1.5;margin:0;">${escapeHtml(message)}</p>`;
    const html = wrapLayout({ title: heading, bodyHtml, orgName });
    const text = `${heading}\n\n${message}\n`;
    return { subject, html, text };
  },
};
