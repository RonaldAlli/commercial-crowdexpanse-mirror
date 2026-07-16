-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('NOT_OPENED', 'OPENED', 'DEPOSITED', 'RELEASED', 'REFUNDED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "EscrowEventType" AS ENUM ('RELEASED', 'REFUNDED', 'FORFEITED');

-- CreateTable
CREATE TABLE "escrow_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'NOT_OPENED',
    "earnestAmountUsd" INTEGER,
    "escrowHolderName" TEXT,
    "escrowHolderContact" TEXT,
    "openedDate" TIMESTAMP(3),
    "earnestDueDate" TIMESTAMP(3),
    "depositedDate" TIMESTAMP(3),
    "contingencyDeadline" TIMESTAMP(3),
    "proofOfDepositDocumentId" TEXT,
    "openedById" TEXT,
    "openedAt" TIMESTAMP(3),
    "depositedById" TEXT,
    "depositedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "escrowRecordId" TEXT NOT NULL,
    "type" "EscrowEventType" NOT NULL,
    "amountUsdSnapshot" INTEGER,
    "holderNameSnapshot" TEXT,
    "proofDocumentIdSnapshot" TEXT,
    "actorId" TEXT,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "escrow_records_opportunityId_key" ON "escrow_records"("opportunityId");

-- CreateIndex
CREATE INDEX "escrow_records_organizationId_idx" ON "escrow_records"("organizationId");

-- CreateIndex
CREATE INDEX "escrow_events_organizationId_idx" ON "escrow_events"("organizationId");

-- CreateIndex
CREATE INDEX "escrow_events_escrowRecordId_idx" ON "escrow_events"("escrowRecordId");

-- AddForeignKey
ALTER TABLE "escrow_records" ADD CONSTRAINT "escrow_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_records" ADD CONSTRAINT "escrow_records_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_events" ADD CONSTRAINT "escrow_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_events" ADD CONSTRAINT "escrow_events_escrowRecordId_fkey" FOREIGN KEY ("escrowRecordId") REFERENCES "escrow_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

