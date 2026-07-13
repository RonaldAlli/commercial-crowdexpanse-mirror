import type {
  MessageKind,
  MessagePayloads,
  RenderedEmail,
  RetryPolicy,
  Template,
} from "@/lib/email/types";

import { invitationTemplate } from "./invitation";
import { systemAlertTemplate } from "./system-alert";

// The CLOSED message registry: the single table mapping each kind to its template
// (renderer) and retry policy. The mapped type forces every MessageKind to supply
// both — a new kind can't be added without a payload type (MessagePayloads), a
// template, and an explicit policy. That is the type-safety guarantee.
type KindDef<K extends MessageKind> = {
  template: Template<MessagePayloads[K]>;
  retry: RetryPolicy;
};

export const MESSAGE_REGISTRY: { [K in MessageKind]: KindDef<K> } = {
  // Reconstructable from source data → eligible for the outbox drain.
  system_alert: { template: systemAlertTemplate, retry: "drainable" },
  // Carries an unrecoverable token in its link → one inline attempt, never drained;
  // recovery is an explicit admin Resend (which rotates). No automatic rotation.
  invitation: { template: invitationTemplate, retry: "inline-only" },
};

export function retryPolicyFor(kind: MessageKind): RetryPolicy {
  return MESSAGE_REGISTRY[kind].retry;
}

export interface RenderedWithVersion extends RenderedEmail {
  version: number;
}

/** Render a kind's template (typed to its payload), plus its version for the ledger. */
export function renderTemplate<K extends MessageKind>(
  kind: K,
  data: MessagePayloads[K],
): RenderedWithVersion {
  const { template } = MESSAGE_REGISTRY[kind];
  return { ...template.render(data), version: template.version };
}
