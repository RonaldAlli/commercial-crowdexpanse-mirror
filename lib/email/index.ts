// Public surface of the communications layer. Feature code imports ONLY from
// here — `messageService.send({ kind, to, data, … })`. Transports and templates
// stay internal. No feature is wired to this in Slice 3d-i (infrastructure only).

import { createMessageService, MessageService } from "./message-service";
import { transportFromEnv } from "./transports";

/** The app-facing service, using the transport selected by EMAIL_PROVIDER. */
export const messageService = createMessageService({ transport: transportFromEnv() });

export { MessageService, createMessageService } from "./message-service";
export type { ResendResolver, DrainResult } from "./message-service";
export { MESSAGE_REGISTRY, retryPolicyFor } from "./templates";
export type {
  MessageKind,
  MessagePayloads,
  RetryPolicy,
  SystemAlertData,
  InvitationEmailData,
  SendRequest,
  RenderedEmail,
  EmailTransport,
  SendResult,
  OutboundPayload,
} from "./types";

// Re-export the singleton's type for callers that want it explicitly.
export type MessageServiceInstance = MessageService;
