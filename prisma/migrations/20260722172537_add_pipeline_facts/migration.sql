-- CreateEnum
CREATE TYPE "PipelineFactClass" AS ENUM ('ARTIFACT', 'EVIDENCE', 'DECISION');

-- CreateEnum
CREATE TYPE "PipelineFactOperation" AS ENUM ('DRAFT', 'RECORD_EVIDENCE', 'DECLARE', 'RETRACT', 'CORRECT', 'INVALIDATE', 'ACCEPT_EXCEPTION');

-- CreateEnum
CREATE TYPE "PipelineActorType" AS ENUM ('HUMAN', 'EXTERNAL_PRINCIPAL', 'DETERMINISTIC_EVALUATOR', 'MIGRATION_PRINCIPAL');

-- CreateEnum
CREATE TYPE "PipelineFactProvenance" AS ENUM ('VERIFIED', 'MIGRATION_ORIGIN');

-- CreateTable
CREATE TABLE "pipeline_facts" (
    "id" TEXT NOT NULL,
    "factChainId" TEXT NOT NULL,
    "globalSequence" BIGSERIAL NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "factClass" "PipelineFactClass" NOT NULL,
    "subjectKey" TEXT,
    "state" TEXT,
    "payload" JSONB,
    "policyVersion" TEXT,
    "ruleSetVersion" TEXT,
    "artifactVersion" TEXT,
    "operation" "PipelineFactOperation" NOT NULL,
    "supersedesFactId" TEXT,
    "actorType" "PipelineActorType" NOT NULL,
    "actorId" TEXT,
    "provenance" "PipelineFactProvenance" NOT NULL DEFAULT 'VERIFIED',
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_facts_org_opp_type_subject_idx" ON "pipeline_facts"("organizationId", "opportunityId", "factType", "subjectKey");

-- CreateIndex
CREATE INDEX "pipeline_facts_chain_idx" ON "pipeline_facts"("factChainId");

-- CreateIndex
CREATE INDEX "pipeline_facts_supersedes_idx" ON "pipeline_facts"("supersedesFactId");

-- CreateIndex
CREATE INDEX "pipeline_facts_org_opp_seq_idx" ON "pipeline_facts"("organizationId", "opportunityId", "globalSequence");

-- AddForeignKey
ALTER TABLE "pipeline_facts" ADD CONSTRAINT "pipeline_facts_supersedesFactId_fkey" FOREIGN KEY ("supersedesFactId") REFERENCES "pipeline_facts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

