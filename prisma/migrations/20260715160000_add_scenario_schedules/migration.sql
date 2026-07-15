-- CreateEnum
CREATE TYPE "LineItemKind" AS ENUM ('INCOME', 'EXPENSE');

-- AlterTable
ALTER TABLE "scenario_results" ADD COLUMN     "grossIncomeAnnualUsd" INTEGER,
ADD COLUMN     "operatingExpensesUsd" INTEGER;

-- CreateTable
CREATE TABLE "scenario_line_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "kind" "LineItemKind" NOT NULL,
    "category" TEXT NOT NULL,
    "amountAnnualUsd" DECIMAL(65,30) NOT NULL,
    "position" INTEGER NOT NULL,
    "source" "AssumptionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scenario_line_items_organizationId_idx" ON "scenario_line_items"("organizationId");

-- CreateIndex
CREATE INDEX "scenario_line_items_scenarioId_idx" ON "scenario_line_items"("scenarioId");

-- AddForeignKey
ALTER TABLE "scenario_line_items" ADD CONSTRAINT "scenario_line_items_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "underwriting_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

