import type { RenderedEmail, SystemAlertData, Template } from "@/lib/email/types";

import { escapeHtml, wrapLayout } from "./layout";

// The reference template — the canonical example of the Template contract, and a
// genuine platform use case (operational/system notices). Feature templates
// (invitation, password_reset, digest, …) follow this exact shape: a pure
// (data) => RenderedEmail with a version for reproducibility.

function coerce(data: SystemAlertData): SystemAlertData {
  return {
    heading: data.heading?.trim() || "System notice",
    message: data.message?.trim() || "",
    orgName: data.orgName?.trim() || undefined,
  };
}

export const systemAlertTemplate: Template<SystemAlertData> = {
  version: 1,
  render(data: SystemAlertData): RenderedEmail {
    const { heading, message, orgName } = coerce(data);
    const subject = heading;
    const bodyHtml = `<p style="font-size:14px;line-height:1.5;margin:0;">${escapeHtml(message)}</p>`;
    const html = wrapLayout({ title: heading, bodyHtml, orgName });
    const text = `${heading}\n\n${message}\n`;
    return { subject, html, text };
  },
};
