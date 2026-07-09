import Link from "next/link";

import { AcceptInviteForm } from "@/components/accept-invite-form";
import { Icon } from "@/components/icons";
import { findInvitationByRawToken, inviteAcceptError, isEmailTaken } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/user-options";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await findInvitationByRawToken(params.token);
  const nowMs = Date.now();

  // Read-only: a PENDING-but-past-expiry invite is treated as expired for
  // display; the accept action is what persists the EXPIRED status.
  const emailTaken = invite ? await isEmailTaken(invite.email) : false;
  const error = inviteAcceptError({
    found: Boolean(invite),
    status: invite?.status,
    expiresAt: invite?.expiresAt,
    nowMs,
    emailTaken,
  });

  const org =
    invite && !error
      ? await prisma.organization.findUnique({
          where: { id: invite.organizationId },
          select: { name: true },
        })
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Icon name="properties" className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">CrowdExpanse</p>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-brand-600">
              Commercial
            </p>
          </div>
        </div>

        <div className="card p-6">
          {error || !invite ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <Icon name="close" className="h-5 w-5" />
              </div>
              <h1 className="text-lg font-semibold text-slate-900">Invitation unavailable</h1>
              <p className="text-sm text-slate-500">{error ?? "This invitation is invalid."}</p>
              <Link href="/login" className="btn-ghost mt-2 inline-flex">
                Go to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-slate-900">Accept your invitation</h1>
              <p className="mb-4 mt-1 text-sm text-slate-500">
                Create your account to join the workspace.
              </p>
              <AcceptInviteForm
                token={params.token}
                email={invite.email}
                orgName={org?.name ?? ""}
                roleName={roleLabel(invite.role)}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
