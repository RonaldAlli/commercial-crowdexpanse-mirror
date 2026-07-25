-- CreateEnum
CREATE TYPE "AiEnvTarget" AS ENUM ('VALIDATION', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "AiGovernanceStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AiReleaseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT,
    "approvedModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeoutMs" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "envTarget" "AiEnvTarget" NOT NULL DEFAULT 'VALIDATION',
    "apiKeyEnc" TEXT,
    "apiKeyLast4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_governance_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pilotScope" TEXT,
    "approvedDataClasses" TEXT,
    "excludedDataClasses" TEXT,
    "maskingPolicyVersion" TEXT,
    "zdrDecision" TEXT,
    "anthropicAccount" TEXT,
    "approvedModel" TEXT,
    "approver" TEXT,
    "approvalDate" TIMESTAMP(3),
    "status" "AiGovernanceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_governance_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_release_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "approver" TEXT,
    "candidateTag" TEXT,
    "candidateCommit" TEXT,
    "validationRunId" TEXT,
    "governanceApprovalId" TEXT,
    "decision" "AiReleaseStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_release_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_validation_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "baselineCommit" TEXT,
    "recommendation" TEXT,
    "resultsJson" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_validation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_admin_audit_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_configs_organizationId_key" ON "ai_provider_configs"("organizationId");

-- CreateIndex
CREATE INDEX "ai_governance_approvals_organizationId_createdAt_idx" ON "ai_governance_approvals"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_release_approvals_organizationId_createdAt_idx" ON "ai_release_approvals"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_validation_runs_organizationId_createdAt_idx" ON "ai_validation_runs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_admin_audit_events_organizationId_createdAt_idx" ON "ai_admin_audit_events"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_governance_approvals" ADD CONSTRAINT "ai_governance_approvals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_release_approvals" ADD CONSTRAINT "ai_release_approvals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_validation_runs" ADD CONSTRAINT "ai_validation_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_admin_audit_events" ADD CONSTRAINT "ai_admin_audit_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

