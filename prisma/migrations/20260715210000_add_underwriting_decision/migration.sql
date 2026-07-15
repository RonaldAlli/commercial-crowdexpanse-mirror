-- CreateEnum
CREATE TYPE "UnderwritingDecisionLevel" AS ENUM ('APPROVED', 'DECLINED', 'DEFERRED');

-- CreateTable
CREATE TABLE "underwriting_decisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "underwritingId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "decision" "UnderwritingDecisionLevel" NOT NULL,
    "rationale" TEXT NOT NULL,
    "scenarioVersion" TEXT NOT NULL,
    "findingsVersion" TEXT,
    "suggestedLevel" "RecommendationLevel",
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "underwriting_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "underwriting_decisions_organizationId_idx" ON "underwriting_decisions"("organizationId");

-- CreateIndex
CREATE INDEX "underwriting_decisions_scenarioId_idx" ON "underwriting_decisions"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "underwriting_decisions_scenarioId_sequence_key" ON "underwriting_decisions"("scenarioId", "sequence");

-- AddForeignKey
ALTER TABLE "underwriting_decisions" ADD CONSTRAINT "underwriting_decisions_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "underwriting_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

