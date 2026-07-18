CREATE TYPE "OpportunityDiligenceStatus" AS ENUM (
  'NOT_REQUESTED',
  'REQUESTED',
  'RECEIVED',
  'REVIEWED',
  'MISSING',
  'NOT_APPLICABLE'
);

CREATE TABLE "opportunity_diligence_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "OpportunityDiligenceStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "requestedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "notes" TEXT,
  "documentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "opportunity_diligence_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "opportunity_diligence_items_opportunityId_key_key" ON "opportunity_diligence_items"("opportunityId", "key");
CREATE INDEX "opportunity_diligence_items_organizationId_idx" ON "opportunity_diligence_items"("organizationId");
CREATE INDEX "opportunity_diligence_items_opportunityId_position_idx" ON "opportunity_diligence_items"("opportunityId", "position");

ALTER TABLE "opportunity_diligence_items"
  ADD CONSTRAINT "opportunity_diligence_items_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opportunity_diligence_items"
  ADD CONSTRAINT "opportunity_diligence_items_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
