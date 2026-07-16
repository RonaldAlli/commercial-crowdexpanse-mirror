-- CreateEnum
CREATE TYPE "FinancingStatus" AS ENUM ('NOT_STARTED', 'APPLIED', 'COMMITTED', 'CLEARED', 'FUNDED', 'DENIED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "financing_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "FinancingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lenderName" TEXT,
    "lenderContact" TEXT,
    "applicationSubmittedDate" TIMESTAMP(3),
    "appraisalOrderedDate" TIMESTAMP(3),
    "appraisalCompletedDate" TIMESTAMP(3),
    "commitmentReceivedDate" TIMESTAMP(3),
    "conditionsReceivedDate" TIMESTAMP(3),
    "conditionsSatisfiedDate" TIMESTAMP(3),
    "closingPackageReceivedDate" TIMESTAMP(3),
    "fundedDate" TIMESTAMP(3),
    "commitmentLetterDocumentId" TEXT,
    "appraisalDocumentId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "resolutionLenderNameSnapshot" TEXT,
    "resolutionCommitmentDocumentIdSnapshot" TEXT,
    "resolutionAppraisalDocumentIdSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financing_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financing_records_opportunityId_key" ON "financing_records"("opportunityId");

-- CreateIndex
CREATE INDEX "financing_records_organizationId_idx" ON "financing_records"("organizationId");

-- AddForeignKey
ALTER TABLE "financing_records" ADD CONSTRAINT "financing_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_records" ADD CONSTRAINT "financing_records_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

