-- CreateEnum
CREATE TYPE "DebtSizingConstraint" AS ENUM ('LTV', 'LTC', 'DSCR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssumptionKey" ADD VALUE 'TARGET_LTV_PCT';
ALTER TYPE "AssumptionKey" ADD VALUE 'TARGET_LTC_PCT';
ALTER TYPE "AssumptionKey" ADD VALUE 'MIN_DSCR';

-- AlterTable
ALTER TABLE "scenario_results" ADD COLUMN     "bindingConstraint" "DebtSizingConstraint",
ADD COLUMN     "loanByDscrUsd" INTEGER,
ADD COLUMN     "loanByLtcUsd" INTEGER,
ADD COLUMN     "loanByLtvUsd" INTEGER,
ADD COLUMN     "sizedLoanUsd" INTEGER;

