-- CreateEnum
CREATE TYPE "OwnerMergeStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateEnum
CREATE TYPE "OwnerMergeReason" AS ENUM ('DUPLICATE_IMPORT', 'MANUAL_DUPLICATE', 'PROVIDER_RECONCILIATION', 'ALIAS_CONSOLIDATION', 'OTHER');

-- AlterTable
ALTER TABLE "owners" ADD COLUMN     "mergedIntoId" TEXT;

-- CreateTable
CREATE TABLE "owner_merge_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "loserId" TEXT NOT NULL,
    "reason" "OwnerMergeReason" NOT NULL,
    "note" TEXT,
    "status" "OwnerMergeStatus" NOT NULL DEFAULT 'ACTIVE',
    "movedSellerIds" TEXT[],
    "movedPropertyIds" TEXT[],
    "addedAliasIds" TEXT[],
    "mergedByUserId" TEXT,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedByUserId" TEXT,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "owner_merge_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_merge_records_organizationId_idx" ON "owner_merge_records"("organizationId");

-- CreateIndex
CREATE INDEX "owner_merge_records_winnerId_idx" ON "owner_merge_records"("winnerId");

-- CreateIndex
CREATE INDEX "owner_merge_records_loserId_idx" ON "owner_merge_records"("loserId");

-- CreateIndex
CREATE INDEX "owner_merge_records_status_idx" ON "owner_merge_records"("status");

-- CreateIndex
CREATE INDEX "owners_mergedIntoId_idx" ON "owners"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_merge_records" ADD CONSTRAINT "owner_merge_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

