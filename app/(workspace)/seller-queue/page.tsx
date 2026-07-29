// CRE Operating Workspace — UI M1 Increment 2: Seller Work Queue route.
//
// Server component. Tenant-scoped via requireUser().organizationId. Binds the EXISTING acquisition-queue
// service (no replacement, no re-ordering, no invented score) to the Increment-1 primitives. Read-only.

import { requireUser } from "@/lib/auth";
import { getAcquisitionQueue, getDailyAcquisitionMetrics } from "@/lib/acquisition-queue";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { SellerQueue } from "@/components/workspace-ui/seller/SellerQueue";
import { mapQueue } from "@/lib/workspace-ui/seller-view";

export const dynamic = "force-dynamic";

export default async function SellerQueuePage() {
  const user = await requireUser();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [queue, metrics] = await Promise.all([
    getAcquisitionQueue(user.organizationId, now),
    getDailyAcquisitionMetrics(user.organizationId, startOfDay),
  ]);

  const rows = mapQueue(queue, now);

  return (
    <div className="space-y-6">
      <PageHeader title="Seller work queue" description="Sellers due for follow-up, most urgent first." />
      <SellerQueue rows={rows} metrics={metrics} />
    </div>
  );
}
