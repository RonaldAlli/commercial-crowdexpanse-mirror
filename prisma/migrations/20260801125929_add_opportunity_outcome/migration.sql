-- CreateEnum
CREATE TYPE "OpportunityOutcome" AS ENUM ('ACTIVE', 'LOST', 'DEAD');

-- AlterTable (additive; existing rows backfilled to ACTIVE via DEFAULT)
ALTER TABLE "opportunities" ADD COLUMN     "outcome" "OpportunityOutcome" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "outcomeAt" TIMESTAMP(3),
ADD COLUMN     "outcomeById" TEXT,
ADD COLUMN     "outcomeReason" TEXT;
