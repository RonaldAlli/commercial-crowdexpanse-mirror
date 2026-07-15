-- CreateEnum
CREATE TYPE "ExternalIdentifierState" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "addressNormalized" TEXT,
ADD COLUMN     "apnNormalized" TEXT,
ADD COLUMN     "countyFipsCode" TEXT;

-- CreateTable
CREATE TABLE "property_identities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "countyFipsCode" TEXT,
    "apnNormalized" TEXT,
    "addressNormalized" TEXT,
    "parcelKey" TEXT,
    "identityVersion" TEXT NOT NULL,
    "rebuiltFromProjectionAt" TIMESTAMP(3),

    CONSTRAINT "property_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_external_identifiers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerIdentifier" TEXT NOT NULL,
    "asOf" TIMESTAMP(3),
    "state" "ExternalIdentifierState" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_external_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_identities_propertyId_key" ON "property_identities"("propertyId");

-- CreateIndex
CREATE INDEX "property_identities_organizationId_parcelKey_idx" ON "property_identities"("organizationId", "parcelKey");

-- CreateIndex
CREATE INDEX "property_identities_organizationId_addressNormalized_idx" ON "property_identities"("organizationId", "addressNormalized");

-- CreateIndex
CREATE INDEX "property_external_identifiers_organizationId_provider_provi_idx" ON "property_external_identifiers"("organizationId", "provider", "providerIdentifier");

-- CreateIndex
CREATE INDEX "property_external_identifiers_organizationId_propertyId_idx" ON "property_external_identifiers"("organizationId", "propertyId");

-- AddForeignKey
ALTER TABLE "property_identities" ADD CONSTRAINT "property_identities_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_external_identifiers" ADD CONSTRAINT "property_external_identifiers_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

