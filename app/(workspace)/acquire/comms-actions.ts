"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { resolveChannelStatus, type MessagingChannel } from "@/lib/comms/conversation-view";
import { commsGate } from "@/lib/comms/gate";

const CHANNELS = new Set(["SMS", "EMAIL", "WHATSAPP"]);

/**
 * Send an outbound message on a channel. CONFIG-GATED: with no provider configured (today), it is a no-op
 * — the compose UI is disabled with the channel's reason, so this only runs once a channel is configured,
 * at which point it persists the outbound message and (later, credential-gated) hands it to the adapter.
 * Also enforces the compliance gate (DNC / opt-out). Org-scoped; gated by UPDATE SELLER.
 */
export async function sendCommsMessage(sellerId: string, channel: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "SELLER", { targetId: sellerId, sellerId }))) return;
  if (!CHANNELS.has(channel)) return;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const seller = await prisma.seller.findFirst({
    where: { id: sellerId, organizationId: user.organizationId },
    select: { id: true, phone: true, email: true, outreachStatus: true, doNotCall: true, doNotText: true, doNotEmail: true, badPhone: true, badEmail: true },
  });
  if (!seller) return;

  // Compliance gate (DNC / opt-out) — never send to a blocked seller.
  if (!commsGate(seller, channel as MessagingChannel).allowed) return;

  // Config gate — do nothing until the channel's provider is configured.
  const cfg = await prisma.commsProviderConfig.findUnique({ where: { organizationId: user.organizationId } });
  const status = resolveChannelStatus(
    cfg
      ? { smsEnabled: cfg.smsEnabled, emailEnabled: cfg.emailEnabled, whatsappEnabled: cfg.whatsappEnabled, hasApiKey: Boolean(cfg.apiKeyEnc), hasMessagingProfile: Boolean(cfg.messagingProfileId), hasFromNumber: Boolean(cfg.fromNumber) }
      : null,
    channel as MessagingChannel,
  );
  if (!status.configured) return;

  // Configured: persist the outbound message. The transport (adapter.send → status SENT/FAILED) plugs in
  // here in a later, credential-gated branch.
  const conversation = await prisma.conversation.upsert({
    where: { sellerId },
    create: { organizationId: user.organizationId, sellerId },
    update: { lastActivityAt: new Date() },
  });
  await prisma.commsMessage.create({
    data: {
      organizationId: user.organizationId,
      conversationId: conversation.id,
      sellerId,
      channel: channel as MessagingChannel,
      direction: "OUTBOUND",
      status: "QUEUED",
      body,
      toAddress: channel === "EMAIL" ? seller.email : seller.phone,
    },
  });
  revalidatePath("/acquire");
}
