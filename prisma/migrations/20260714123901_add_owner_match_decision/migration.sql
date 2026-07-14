-- CreateEnum
CREATE TYPE "OwnerMatchStatus" AS ENUM ('CONFIRMED', 'DISMISSED');

-- CreateTable
CREATE TABLE "owner_match_decisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerIdA" TEXT NOT NULL,
    "ownerIdB" TEXT NOT NULL,
    "status" "OwnerMatchStatus" NOT NULL,
    "reason" TEXT,
    "signalFingerprint" TEXT NOT NULL,
    "note" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopenedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),

    CONSTRAINT "owner_match_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_match_decisions_organizationId_status_idx" ON "owner_match_decisions"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "owner_match_decisions_organizationId_ownerIdA_ownerIdB_key" ON "owner_match_decisions"("organizationId", "ownerIdA", "ownerIdB");

-- AddForeignKey
ALTER TABLE "owner_match_decisions" ADD CONSTRAINT "owner_match_decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

