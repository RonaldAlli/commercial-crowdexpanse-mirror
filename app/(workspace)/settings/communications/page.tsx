import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { CommsSettingsForm } from "@/components/comms-settings-form";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { commsReadiness } from "@/lib/comms/provider-settings";

export const dynamic = "force-dynamic";

/** Operator communications settings (Branch 4). ADMIN-only. Configures the org's Telnyx provider; secrets
 *  are encrypted server-side and never sent to the browser. Providers stay inert until a real adapter ships. */
export default async function CommunicationsSettingsPage() {
  const user = await requireRole(UserRole.ADMIN);

  const cfg = await prisma.commsProviderConfig.findUnique({ where: { organizationId: user.organizationId } });
  const encryptionReady = Boolean(process.env.COMMS_ENCRYPTION_KEY && process.env.COMMS_ENCRYPTION_KEY.length === 64);

  const channelCfg = cfg
    ? { smsEnabled: cfg.smsEnabled, emailEnabled: cfg.emailEnabled, whatsappEnabled: cfg.whatsappEnabled, hasApiKey: Boolean(cfg.apiKeyEnc), hasMessagingProfile: Boolean(cfg.messagingProfileId), hasFromNumber: Boolean(cfg.fromNumber) }
    : null;
  const voiceCfg = cfg ? { voiceEnabled: cfg.voiceEnabled, hasApiKey: Boolean(cfg.apiKeyEnc), hasConnectionId: Boolean(cfg.connectionId) } : null;
  const readiness = commsReadiness(channelCfg, voiceCfg, encryptionReady);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Communications"
        description="Configure the Telnyx provider for calling, SMS, WhatsApp, and email. Secrets are encrypted at rest."
      />
      <div className="card max-w-2xl p-6">
        <CommsSettingsForm
          initial={{
            fromNumber: cfg?.fromNumber ?? "",
            connectionId: cfg?.connectionId ?? "",
            messagingProfileId: cfg?.messagingProfileId ?? "",
            apiKeyLast4: cfg?.apiKeyLast4 ?? null,
            smsEnabled: cfg?.smsEnabled ?? false,
            voiceEnabled: cfg?.voiceEnabled ?? false,
            whatsappEnabled: cfg?.whatsappEnabled ?? false,
            emailEnabled: cfg?.emailEnabled ?? false,
          }}
          readiness={readiness}
        />
      </div>
    </div>
  );
}
