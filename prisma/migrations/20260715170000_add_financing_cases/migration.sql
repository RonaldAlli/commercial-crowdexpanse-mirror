-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssumptionKey" ADD VALUE 'INCOME_GROWTH_PCT';
ALTER TYPE "AssumptionKey" ADD VALUE 'EXPENSE_GROWTH_PCT';
ALTER TYPE "AssumptionKey" ADD VALUE 'HOLD_YEARS';

-- AlterTable
ALTER TABLE "scenario_results" DROP COLUMN "annualDebtServiceUsd",
DROP COLUMN "bindingConstraint",
DROP COLUMN "debtYieldPct",
DROP COLUMN "dscr",
DROP COLUMN "loanByDscrUsd",
DROP COLUMN "loanByLtcUsd",
DROP COLUMN "loanByLtvUsd",
DROP COLUMN "sizedLoanUsd";

-- CreateTable
CREATE TABLE "financing_cases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "source" "AssumptionSource" NOT NULL,
    "financingCaseVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financing_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_assumptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financingCaseId" TEXT NOT NULL,
    "key" "AssumptionKey" NOT NULL,
    "valueNumeric" DECIMAL(65,30) NOT NULL,
    "source" "AssumptionSource" NOT NULL,
    "sourceField" TEXT,
    "sourceAsOf" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financing_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_case_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financingCaseId" TEXT NOT NULL,
    "financingCaseVersion" TEXT NOT NULL,
    "calcLibVersion" INTEGER NOT NULL,
    "annualDebtServiceUsd" DOUBLE PRECISION,
    "dscr" DOUBLE PRECISION,
    "debtYieldPct" DOUBLE PRECISION,
    "loanByLtvUsd" INTEGER,
    "loanByLtcUsd" INTEGER,
    "loanByDscrUsd" INTEGER,
    "sizedLoanUsd" INTEGER,
    "bindingConstraint" "DebtSizingConstraint",
    "projectionYears" INTEGER,
    "avgDscr" DOUBLE PRECISION,
    "cumulativeCashFlowUsd" INTEGER,

    CONSTRAINT "financing_case_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_years" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financingCaseId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "noiUsd" DOUBLE PRECISION NOT NULL,
    "debtServiceUsd" DOUBLE PRECISION NOT NULL,
    "cashFlowBeforeTaxUsd" DOUBLE PRECISION NOT NULL,
    "dscr" DOUBLE PRECISION,

    CONSTRAINT "cash_flow_years_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financing_cases_organizationId_idx" ON "financing_cases"("organizationId");

-- CreateIndex
CREATE INDEX "financing_cases_scenarioId_idx" ON "financing_cases"("scenarioId");

-- CreateIndex
CREATE INDEX "financing_assumptions_organizationId_idx" ON "financing_assumptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "financing_assumptions_financingCaseId_key_key" ON "financing_assumptions"("financingCaseId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "financing_case_results_financingCaseId_key" ON "financing_case_results"("financingCaseId");

-- CreateIndex
CREATE INDEX "financing_case_results_organizationId_idx" ON "financing_case_results"("organizationId");

-- CreateIndex
CREATE INDEX "cash_flow_years_organizationId_idx" ON "cash_flow_years"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_years_financingCaseId_year_key" ON "cash_flow_years"("financingCaseId", "year");

-- AddForeignKey
ALTER TABLE "financing_cases" ADD CONSTRAINT "financing_cases_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "underwriting_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_assumptions" ADD CONSTRAINT "financing_assumptions_financingCaseId_fkey" FOREIGN KEY ("financingCaseId") REFERENCES "financing_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_case_results" ADD CONSTRAINT "financing_case_results_financingCaseId_fkey" FOREIGN KEY ("financingCaseId") REFERENCES "financing_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_years" ADD CONSTRAINT "cash_flow_years_financingCaseId_fkey" FOREIGN KEY ("financingCaseId") REFERENCES "financing_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

