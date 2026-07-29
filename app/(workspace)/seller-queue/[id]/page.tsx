// CRE Operating Workspace — UI M1 Increment 2: Seller Record route.
//
// Server component. Tenant-scoped via requireUser().organizationId; a miss -> notFound() (404, not
// cross-tenant leakage). Reuses EXISTING pure helpers (checklist, promotion resolver, comms gate) and
// EXISTING server actions (bound with the seller id). Creates no opportunity, adds no write path, and
// reuses the existing seller ActivityLog timeline (no second event history).

import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { sellerQualificationChecklist, checklistProgress } from "@/lib/acquisition-checklist";
import { resolveSellerPromotion } from "@/lib/promote-seller";
import { OUTREACH_STATUS_OPTIONS } from "@/lib/contact-options";
import { DISPOSITIONS } from "@/lib/disposition";
import { promotionView, commsGateView } from "@/lib/workspace-ui/seller-view";
import { SellerRecordView } from "@/components/workspace-ui/seller/SellerRecordView";
import { setSellerOutreachStatus } from "@/app/(workspace)/sellers/actions";
import { recordDisposition } from "@/app/(workspace)/acquire/actions";
import { logContactTouchAction } from "@/app/(workspace)/contacts/actions";

export const dynamic = "force-dynamic";

const TOUCH_TYPES = ["CALL", "TEXT", "EMAIL", "MAIL", "NOTE"] as const;

export default async function SellerRecordPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const seller = await prisma.seller.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      owner: { select: { id: true, displayName: true } },
      properties: { select: { id: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!seller) notFound();

  const checklistItems = sellerQualificationChecklist({
    phone: seller.phone,
    email: seller.email,
    motivation: seller.motivation,
    hasProperty: seller.properties.length > 0,
    hasAcquisitionChannel: Boolean(seller.acquisitionChannel),
    outreachStatus: seller.outreachStatus,
  });

  const canCreateOpportunity = can(user.role, "CREATE", "OPPORTUNITY");
  const promotion = resolveSellerPromotion({
    canCreateOpportunity,
    outreachStatus: seller.outreachStatus,
    sellerId: seller.id,
    propertyIds: seller.properties.map((p) => p.id),
  });

  return (
    <SellerRecordView
      seller={{
        id: seller.id,
        name: seller.name,
        company: seller.company,
        email: seller.email,
        phone: seller.phone,
        city: seller.city,
        state: seller.state,
        motivation: seller.motivation,
        outreachStatus: seller.outreachStatus,
        acquisitionChannel: seller.acquisitionChannel,
        nextFollowUpAt: seller.nextFollowUpAt,
      }}
      owner={seller.owner}
      propertyCount={seller.properties.length}
      checklist={{ items: checklistItems, progress: checklistProgress(checklistItems) }}
      promotion={promotionView(promotion, { canCreateOpportunity, outreachStatus: seller.outreachStatus })}
      gate={commsGateView({
        outreachStatus: seller.outreachStatus,
        doNotCall: seller.doNotCall,
        doNotText: seller.doNotText,
        doNotEmail: seller.doNotEmail,
        badPhone: seller.badPhone,
        badEmail: seller.badEmail,
        phone: seller.phone,
        email: seller.email,
      })}
      activities={seller.activities}
      statusOptions={OUTREACH_STATUS_OPTIONS}
      dispositions={DISPOSITIONS}
      touchTypes={TOUCH_TYPES}
      backHref="/seller-queue"
      actions={{
        setStatus: setSellerOutreachStatus.bind(null, seller.id),
        recordDisposition: recordDisposition.bind(null, seller.id),
        logTouch: logContactTouchAction.bind(null, "seller", seller.id),
      }}
    />
  );
}
