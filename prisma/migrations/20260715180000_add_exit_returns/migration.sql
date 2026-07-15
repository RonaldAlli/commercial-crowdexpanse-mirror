-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssumptionKey" ADD VALUE 'EXIT_CAP_RATE_PCT';
ALTER TYPE "AssumptionKey" ADD VALUE 'SELLING_COSTS_PCT';

-- AlterTable
ALTER TABLE "financing_case_results" ADD COLUMN     "contributedEquityUsd" DOUBLE PRECISION,
ADD COLUMN     "debtPayoffUsd" DOUBLE PRECISION,
ADD COLUMN     "equityMultiple" DOUBLE PRECISION,
ADD COLUMN     "exitCapRatePct" DOUBLE PRECISION,
ADD COLUMN     "grossExitValueUsd" DOUBLE PRECISION,
ADD COLUMN     "leveredIrrPct" DOUBLE PRECISION,
ADD COLUMN     "netSaleProceedsUsd" DOUBLE PRECISION,
ADD COLUMN     "sellingCostsPct" DOUBLE PRECISION,
ADD COLUMN     "sellingCostsUsd" DOUBLE PRECISION,
ADD COLUMN     "terminalNoiUsd" DOUBLE PRECISION,
ADD COLUMN     "totalProfitUsd" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "equity_cash_flow_years" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financingCaseId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "equityCashFlowUsd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "equity_cash_flow_years_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equity_cash_flow_years_organizationId_idx" ON "equity_cash_flow_years"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "equity_cash_flow_years_financingCaseId_year_key" ON "equity_cash_flow_years"("financingCaseId", "year");

-- AddForeignKey
ALTER TABLE "equity_cash_flow_years" ADD CONSTRAINT "equity_cash_flow_years_financingCaseId_fkey" FOREIGN KEY ("financingCaseId") REFERENCES "financing_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

