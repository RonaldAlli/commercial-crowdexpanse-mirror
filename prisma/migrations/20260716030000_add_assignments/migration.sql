-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('NOT_STARTED', 'DRAFTED', 'EXECUTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'ASSIGNMENT_AGREEMENT';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "sourceOpportunityId" TEXT;

-- CreateTable
CREATE TABLE "assignment_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "assignorSellerId" TEXT,
    "assignorName" TEXT,
    "assignorContact" TEXT,
    "assigneeBuyerId" TEXT,
    "assigneeName" TEXT,
    "assigneeContact" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "executedFeeUsdSnapshot" INTEGER,
    "executedContractValueUsdSnapshot" INTEGER,
    "executedAssignorNameSnapshot" TEXT,
    "executedAssigneeNameSnapshot" TEXT,
    "executedAgreementDocumentIdSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assignment_records_opportunityId_key" ON "assignment_records"("opportunityId");

-- CreateIndex
CREATE INDEX "assignment_records_organizationId_idx" ON "assignment_records"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_sourceOpportunityId_documentType_generationSequen_key" ON "documents"("sourceOpportunityId", "documentType", "generationSequence");

-- AddForeignKey
ALTER TABLE "assignment_records" ADD CONSTRAINT "assignment_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_records" ADD CONSTRAINT "assignment_records_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

