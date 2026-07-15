-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('DEAL_QUALITY', 'FINANCING', 'CASH_FLOW', 'RETURN');

-- CreateEnum
CREATE TYPE "RecommendationLevel" AS ENUM ('PROCEED', 'PROCEED_WITH_CONDITIONS', 'PASS');

-- CreateTable
CREATE TABLE "scenario_findings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "financingCaseId" TEXT,
    "code" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "decisive" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "observedValue" DOUBLE PRECISION,
    "thresholdValue" DOUBLE PRECISION,
    "position" INTEGER NOT NULL,

    CONSTRAINT "scenario_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_recommendations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "level" "RecommendationLevel" NOT NULL,
    "findingsVersion" TEXT NOT NULL,
    "rulesetVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scenario_findings_organizationId_idx" ON "scenario_findings"("organizationId");

-- CreateIndex
CREATE INDEX "scenario_findings_scenarioId_idx" ON "scenario_findings"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_recommendations_scenarioId_key" ON "scenario_recommendations"("scenarioId");

-- CreateIndex
CREATE INDEX "scenario_recommendations_organizationId_idx" ON "scenario_recommendations"("organizationId");

-- AddForeignKey
ALTER TABLE "scenario_findings" ADD CONSTRAINT "scenario_findings_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "underwriting_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_recommendations" ADD CONSTRAINT "scenario_recommendations_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "underwriting_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

