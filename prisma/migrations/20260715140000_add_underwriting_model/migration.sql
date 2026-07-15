-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('DRAFT', 'LOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AssumptionSource" AS ENUM ('MANUAL', 'SEEDED');

-- CreateEnum
CREATE TYPE "AssumptionKey" AS ENUM ('PURCHASE_PRICE', 'RENOVATION_BUDGET', 'CLOSING_COSTS', 'GROSS_INCOME', 'OPERATING_EXPENSES', 'LOAN_AMOUNT', 'INTEREST_RATE', 'AMORTIZATION_YEARS', 'UNIT_COUNT', 'ESTIMATED_VALUE');

-- CreateTable
CREATE TABLE "underwritings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "activeScenarioId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "underwritings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "underwriting_scenarios" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "underwritingId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'DRAFT',
    "modelVersion" INTEGER NOT NULL,
    "calcLibVersion" INTEGER NOT NULL,
    "rulesetVersion" INTEGER NOT NULL,
    "scenarioVersion" TEXT NOT NULL,
    "analystSummary" TEXT,
    "supersededById" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "underwriting_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "underwriting_assumptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "key" "AssumptionKey" NOT NULL,
    "valueNumeric" DECIMAL(65,30) NOT NULL,
    "source" "AssumptionSource" NOT NULL,
    "sourceField" TEXT,
    "sourceAsOf" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "underwriting_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "scenarioVersion" TEXT NOT NULL,
    "calcLibVersion" INTEGER NOT NULL,
    "noiAnnualUsd" INTEGER,
    "allInCostUsd" INTEGER NOT NULL,
    "capRate" DOUBLE PRECISION,
    "pricePerUnitUsd" DOUBLE PRECISION,
    "expenseRatioPct" DOUBLE PRECISION,
    "annualDebtServiceUsd" DOUBLE PRECISION,
    "dscr" DOUBLE PRECISION,
    "debtYieldPct" DOUBLE PRECISION,
    "spreadUsd" INTEGER,

    CONSTRAINT "scenario_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "underwritings_opportunityId_key" ON "underwritings"("opportunityId");

-- CreateIndex
CREATE INDEX "underwritings_organizationId_idx" ON "underwritings"("organizationId");

-- CreateIndex
CREATE INDEX "underwriting_scenarios_organizationId_idx" ON "underwriting_scenarios"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "underwriting_scenarios_underwritingId_version_key" ON "underwriting_scenarios"("underwritingId", "version");

-- CreateIndex
CREATE INDEX "underwriting_assumptions_organizationId_idx" ON "underwriting_assumptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "underwriting_assumptions_scenarioId_key_key" ON "underwriting_assumptions"("scenarioId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_results_scenarioId_key" ON "scenario_results"("scenarioId");

-- CreateIndex
CREATE INDEX "scenario_results_organizationId_idx" ON "scenario_results"("organizationId");

-- AddForeignKey
ALTER TABLE "underwritings" ADD CONSTRAINT "underwritings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwritings" ADD CONSTRAINT "underwritings_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwriting_scenarios" ADD CONSTRAINT "underwriting_scenarios_underwritingId_fkey" FOREIGN KEY ("underwritingId") REFERENCES "underwritings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwriting_assumptions" ADD CONSTRAINT "underwriting_assumptions_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "underwriting_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_results" ADD CONSTRAINT "scenario_results_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "underwriting_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

