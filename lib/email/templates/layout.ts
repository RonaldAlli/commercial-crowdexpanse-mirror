// Shared HTML shell for every email. Kept dependency-free (plain string) on
// purpose — no MJML/react-email until volume justifies it. Plaintext is rendered
// per-template (each template owns its own text fallback).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface LayoutInput {
  title: string;
  bodyHtml: string;
  orgName?: string;
}

export function wrapLayout({ title, bodyHtml, orgName }: LayoutInput): string {
  const brand = orgName ? escapeHtml(orgName) : "CrowdExpanse";
  return [
    `<!doctype html>`,
    `<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">`,
    `<div style="max-width:560px;margin:0 auto;padding:24px;">`,
    `<div style="font-size:14px;font-weight:700;color:#3f3f46;margin-bottom:16px;">${brand}</div>`,
    `<div style="background:#ffffff;border-radius:8px;padding:24px;">`,
    `<h1 style="font-size:18px;margin:0 0 16px;">${escapeHtml(title)}</h1>`,
    bodyHtml,
    `</div>`,
    `<div style="font-size:12px;color:#a1a1aa;margin-top:16px;">`,
    `You received this message from ${brand}. Manage your notification preferences in your account.`,
    `</div>`,
    `</div>`,
    `</body></html>`,
  ].join("");
}

export { escapeHtml };
