import type { MessageKind, RenderedEmail, Template } from "@/lib/email/types";

import { systemAlertTemplate } from "./system-alert";

// The template registry: the single place a MessageKind maps to its renderer.
// MessageService selects from here — features never touch templates directly.
const TEMPLATES: Record<MessageKind, Template> = {
  system_alert: systemAlertTemplate,
};

export function getTemplate(kind: MessageKind): Template {
  const template = TEMPLATES[kind];
  if (!template) throw new Error(`[email] no template registered for kind "${kind}".`);
  return template;
}

export interface RenderedWithVersion extends RenderedEmail {
  version: number;
}

/** Render a kind's template, returning the output plus its version for the ledger. */
export function renderTemplate(kind: MessageKind, data: unknown): RenderedWithVersion {
  const template = getTemplate(kind);
  return { ...template.render(data), version: template.version };
}

export { TEMPLATES };
