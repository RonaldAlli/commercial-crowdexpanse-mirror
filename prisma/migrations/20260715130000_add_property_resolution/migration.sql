-- CreateEnum
CREATE TYPE "ResolutionBasis" AS ENUM ('UNIQUE_PARCEL', 'UNIQUE_EXTERNAL_IDENTIFIER', 'PARCEL_CONFLICT', 'ADDRESS_PROPOSAL', 'EXTERNAL_ID_CONFLICT');

-- CreateEnum
CREATE TYPE "ResolutionEventKind" AS ENUM ('RESOLVE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PropertyMatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISMISSED');

-- AlterTable
ALTER TABLE "property_external_identifiers" ADD COLUMN     "revokedByResolutionId" TEXT;

-- CreateTable
CREATE TABLE "property_resolutions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ResolutionEventKind" NOT NULL,
    "resolvedPropertyId" TEXT NOT NULL,
    "basis" "ResolutionBasis" NOT NULL,
    "evidence" JSONB NOT NULL,
    "attachedExternalIdentifierIds" JSONB NOT NULL,
    "reason" TEXT,
    "requestKey" TEXT,
    "supersedesResolutionId" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_match_decisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyIdA" TEXT NOT NULL,
    "propertyIdB" TEXT NOT NULL,
    "basis" "ResolutionBasis" NOT NULL,
    "status" "PropertyMatchStatus" NOT NULL,
    "evidenceFingerprint" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_match_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_resolutions_organizationId_resolvedPropertyId_idx" ON "property_resolutions"("organizationId", "resolvedPropertyId");

-- CreateIndex
CREATE UNIQUE INDEX "property_resolutions_organizationId_requestKey_key" ON "property_resolutions"("organizationId", "requestKey");

-- CreateIndex
CREATE INDEX "property_match_decisions_organizationId_status_idx" ON "property_match_decisions"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "property_match_decisions_organizationId_propertyIdA_propert_key" ON "property_match_decisions"("organizationId", "propertyIdA", "propertyIdB");

-- AddForeignKey
ALTER TABLE "property_resolutions" ADD CONSTRAINT "property_resolutions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_match_decisions" ADD CONSTRAINT "property_match_decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

