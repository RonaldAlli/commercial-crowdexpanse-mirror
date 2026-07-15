-- CreateEnum
CREATE TYPE "DocumentOrigin" AS ENUM ('UPLOADED', 'GENERATED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "contentSha256" TEXT,
ADD COLUMN     "contentSnapshot" JSONB,
ADD COLUMN     "decisionIdSnapshot" TEXT,
ADD COLUMN     "decisionSequenceSnapshot" INTEGER,
ADD COLUMN     "findingsVersionSnapshot" TEXT,
ADD COLUMN     "generatedAt" TIMESTAMP(3),
ADD COLUMN     "generatedById" TEXT,
ADD COLUMN     "generationSequence" INTEGER,
ADD COLUMN     "generatorVersion" INTEGER,
ADD COLUMN     "origin" "DocumentOrigin" NOT NULL DEFAULT 'UPLOADED',
ADD COLUMN     "scenarioVersionSnapshot" TEXT,
ADD COLUMN     "snapshotSchemaVersion" INTEGER,
ADD COLUMN     "sourceScenarioId" TEXT,
ADD COLUMN     "sourceScenarioVersion" INTEGER,
ADD COLUMN     "templateVersion" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "documents_sourceScenarioId_documentType_generationSequence_key" ON "documents"("sourceScenarioId", "documentType", "generationSequence");
