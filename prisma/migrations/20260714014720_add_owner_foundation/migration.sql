-- CreateEnum
CREATE TYPE "OwnerEntityType" AS ENUM ('INDIVIDUAL', 'LLC', 'TRUST', 'CORPORATION', 'PARTNERSHIP', 'REIT', 'GOVERNMENT', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OwnerStatus" AS ENUM ('ACTIVE', 'MERGED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "entityType" "OwnerEntityType" NOT NULL DEFAULT 'UNKNOWN',
    "status" "OwnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "matchKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_aliases" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "sourceCategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_external_identifiers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_external_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owners_organizationId_idx" ON "owners"("organizationId");

-- CreateIndex
CREATE INDEX "owners_status_idx" ON "owners"("status");

-- CreateIndex
CREATE INDEX "owners_matchKey_idx" ON "owners"("matchKey");

-- CreateIndex
CREATE INDEX "owner_aliases_ownerId_idx" ON "owner_aliases"("ownerId");

-- CreateIndex
CREATE INDEX "owner_aliases_normalizedValue_idx" ON "owner_aliases"("normalizedValue");

-- CreateIndex
CREATE INDEX "owner_external_identifiers_ownerId_idx" ON "owner_external_identifiers"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "owner_external_identifiers_organizationId_provider_external_key" ON "owner_external_identifiers"("organizationId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "properties_ownerId_idx" ON "properties"("ownerId");

-- CreateIndex
CREATE INDEX "sellers_ownerId_idx" ON "sellers"("ownerId");

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_aliases" ADD CONSTRAINT "owner_aliases_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_external_identifiers" ADD CONSTRAINT "owner_external_identifiers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

