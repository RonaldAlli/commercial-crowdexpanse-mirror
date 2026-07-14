-- AlterTable
ALTER TABLE "owner_match_decisions" ADD COLUMN     "mergeRecordId" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "owner_match_decisions_mergeRecordId_key" ON "owner_match_decisions"("mergeRecordId");

