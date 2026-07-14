-- CreateEnum
CREATE TYPE "RefreshJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'NOOP');

-- AlterTable
ALTER TABLE "intelligence_signals" ADD COLUMN     "adapterVersion" INTEGER;

-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "adapterVersion" INTEGER;

-- CreateTable
CREATE TABLE "refresh_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "status" "RefreshJobStatus" NOT NULL DEFAULT 'RUNNING',
    "requestKey" TEXT NOT NULL,
    "targetEntityType" "IntelligenceEntityType" NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "observationsRecorded" INTEGER NOT NULL DEFAULT 0,
    "signalsAccepted" INTEGER NOT NULL DEFAULT 0,
    "signalsSuperseded" INTEGER NOT NULL DEFAULT 0,
    "affectedEntityIds" TEXT[],
    "actorUserId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refresh_jobs_organizationId_status_idx" ON "refresh_jobs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_jobs_organizationId_sourceKey_requestKey_key" ON "refresh_jobs"("organizationId", "sourceKey", "requestKey");

-- AddForeignKey
ALTER TABLE "refresh_jobs" ADD CONSTRAINT "refresh_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

