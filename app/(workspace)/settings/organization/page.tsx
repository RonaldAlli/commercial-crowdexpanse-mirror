import { UserRole } from "@prisma/client";

import { OrganizationSettingsForm } from "@/components/organization-settings-form";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage() {
  const user = await requireRole(UserRole.ADMIN);

  const [org, settings] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, slug: true },
    }),
    getOrgSettings(user.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Organization"
        description="Organization identity and workspace-wide defaults."
      />
      <div className="card max-w-2xl p-6">
        <OrganizationSettingsForm
          initial={{
            name: org?.name ?? "",
            slug: org?.slug ?? "",
            inviteExpiryDays: settings.inviteExpiryDays,
            defaultInviteRole: settings.defaultInviteRole,
          }}
        />
      </div>
    </div>
  );
}
