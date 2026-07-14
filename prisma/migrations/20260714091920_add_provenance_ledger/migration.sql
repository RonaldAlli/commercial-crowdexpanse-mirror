-- CreateEnum
CREATE TYPE "SourceCategory" AS ENUM ('USER_ENTERED', 'LICENSED', 'PUBLIC', 'CALCULATION', 'AI_DERIVED');

-- CreateEnum
CREATE TYPE "SignalState" AS ENUM ('ACCEPTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "IntelligenceEntityType" AS ENUM ('OWNER');

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "IntelligenceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "valueRaw" TEXT NOT NULL,
    "valueNormalized" TEXT,
    "sourceCategory" "SourceCategory" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "licenseRef" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "method" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "normalizationVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_signals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "IntelligenceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "valueRaw" TEXT NOT NULL,
    "valueNormalized" TEXT,
    "sourceCategory" "SourceCategory" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "licenseRef" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "method" TEXT NOT NULL,
    "state" "SignalState" NOT NULL DEFAULT 'ACCEPTED',
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "observationId" TEXT NOT NULL,
    "supersededById" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "normalizationVersion" INTEGER NOT NULL DEFAULT 1,
    "projectionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "observations_organizationId_idx" ON "observations"("organizationId");

-- CreateIndex
CREATE INDEX "observations_entityType_entityId_fieldKey_idx" ON "observations"("entityType", "entityId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_signals_observationId_key" ON "intelligence_signals"("observationId");

-- CreateIndex
CREATE INDEX "intelligence_signals_organizationId_idx" ON "intelligence_signals"("organizationId");

-- CreateIndex
CREATE INDEX "intelligence_signals_entityType_entityId_fieldKey_state_idx" ON "intelligence_signals"("entityType", "entityId", "fieldKey", "state");

-- CreateIndex
CREATE INDEX "intelligence_signals_supersededById_idx" ON "intelligence_signals"("supersededById");

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_signals" ADD CONSTRAINT "intelligence_signals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_signals" ADD CONSTRAINT "intelligence_signals_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

