-- CreateEnum
CREATE TYPE "SensitivityMetric" AS ENUM ('LEVERED_IRR_PCT', 'EQUITY_MULTIPLE', 'TOTAL_PROFIT_USD', 'CAP_RATE', 'DSCR');

-- CreateTable
CREATE TABLE "sensitivity_analyses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financingCaseId" TEXT NOT NULL,
    "targetMetric" "SensitivityMetric" NOT NULL,
    "xKey" "AssumptionKey" NOT NULL,
    "xMin" DOUBLE PRECISION NOT NULL,
    "xMax" DOUBLE PRECISION NOT NULL,
    "xSteps" INTEGER NOT NULL,
    "yKey" "AssumptionKey",
    "yMin" DOUBLE PRECISION,
    "yMax" DOUBLE PRECISION,
    "ySteps" INTEGER,
    "sensitivityVersion" TEXT NOT NULL,
    "calcLibVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensitivity_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensitivity_cells" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sensitivityAnalysisId" TEXT NOT NULL,
    "xIndex" INTEGER NOT NULL,
    "yIndex" INTEGER NOT NULL,
    "xValue" DOUBLE PRECISION NOT NULL,
    "yValue" DOUBLE PRECISION,
    "metricValue" DOUBLE PRECISION,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sensitivity_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sensitivity_analyses_financingCaseId_key" ON "sensitivity_analyses"("financingCaseId");

-- CreateIndex
CREATE INDEX "sensitivity_analyses_organizationId_idx" ON "sensitivity_analyses"("organizationId");

-- CreateIndex
CREATE INDEX "sensitivity_cells_organizationId_idx" ON "sensitivity_cells"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sensitivity_cells_sensitivityAnalysisId_xIndex_yIndex_key" ON "sensitivity_cells"("sensitivityAnalysisId", "xIndex", "yIndex");

-- AddForeignKey
ALTER TABLE "sensitivity_analyses" ADD CONSTRAINT "sensitivity_analyses_financingCaseId_fkey" FOREIGN KEY ("financingCaseId") REFERENCES "financing_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensitivity_cells" ADD CONSTRAINT "sensitivity_cells_sensitivityAnalysisId_fkey" FOREIGN KEY ("sensitivityAnalysisId") REFERENCES "sensitivity_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

