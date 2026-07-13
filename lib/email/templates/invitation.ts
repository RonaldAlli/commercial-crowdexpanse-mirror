import type { InvitationEmailData, RenderedEmail, Template } from "@/lib/email/types";

import { escapeHtml, wrapLayout } from "./layout";

// Invitation delivery template. The accept URL is absolute (built from APP_URL by
// the caller) and rendered into the body only — it is never persisted. Pure and
// versioned like every kind, so it renders identically in a test without sending.

function daysUntil(expiresAt: Date): number {
  const ms = expiresAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export const invitationTemplate: Template<InvitationEmailData> = {
  version: 1,
  render(data: InvitationEmailData): RenderedEmail {
    const orgName = data.orgName?.trim() || "your organization";
    const inviter = data.inviterName?.trim();
    const role = data.role;
    const days = daysUntil(data.expiresAt);
    const heading = `You're invited to join ${orgName}`;
    const subject = heading;

    const introLine = inviter
      ? `${escapeHtml(inviter)} has invited you to join <strong>${escapeHtml(orgName)}</strong> on CrowdExpanse as ${escapeHtml(role)}.`
      : `You've been invited to join <strong>${escapeHtml(orgName)}</strong> on CrowdExpanse as ${escapeHtml(role)}.`;

    const bodyHtml = [
      `<p style="font-size:14px;line-height:1.5;margin:0 0 20px;">${introLine}</p>`,
      `<p style="margin:0 0 24px;">`,
      `<a href="${escapeHtml(data.acceptUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">Accept invitation</a>`,
      `</p>`,
      `<p style="font-size:12px;line-height:1.5;color:#71717a;margin:0 0 8px;">Or paste this link into your browser:</p>`,
      `<p style="font-size:12px;line-height:1.5;color:#3f3f46;word-break:break-all;margin:0 0 20px;">${escapeHtml(data.acceptUrl)}</p>`,
      `<p style="font-size:12px;line-height:1.5;color:#71717a;margin:0;">This invitation expires in ${days} day${days === 1 ? "" : "s"}.</p>`,
    ].join("");

    const html = wrapLayout({ title: heading, bodyHtml, orgName });
    const text = [
      heading,
      "",
      inviter
        ? `${inviter} has invited you to join ${orgName} on CrowdExpanse as ${role}.`
        : `You've been invited to join ${orgName} on CrowdExpanse as ${role}.`,
      "",
      "Accept your invitation:",
      data.acceptUrl,
      "",
      `This invitation expires in ${days} day${days === 1 ? "" : "s"}.`,
      "",
    ].join("\n");

    return { subject, html, text };
  },
};
