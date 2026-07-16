-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'RETRY_SCHEDULED', 'SUCCEEDED', 'DEAD_LETTERED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AutomationExecutionOutcome" AS ENUM ('SUCCEEDED', 'NOOP', 'FAILED');

-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('SCHEDULE', 'DOMAIN_EVENT', 'WEBHOOK', 'MANUAL');

-- CreateEnum
CREATE TYPE "AutomationPolicyDecision" AS ENUM ('ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'NO_ACTION', 'STALE_CONTEXT');

-- CreateEnum
CREATE TYPE "AutomationFailureClass" AS ENUM ('TRANSIENT_INFRASTRUCTURE', 'DATABASE_CONTENTION', 'DEPENDENCY_UNAVAILABLE', 'POLICY_DENIED', 'STALE_CONTEXT', 'VALIDATION_FAILURE', 'PERMISSION_FAILURE', 'ORG_SCOPE_VIOLATION', 'INVARIANT_VIOLATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AutomationPrincipalType" AS ENUM ('AUTOMATION', 'SYSTEM', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'AUTOMATION', 'WEBHOOK');

-- AlterTable
ALTER TABLE "activity_log" ADD COLUMN     "actorType" "ActorType" NOT NULL DEFAULT 'USER',
ADD COLUMN     "automationExecutionId" TEXT;

-- CreateTable
CREATE TABLE "automation_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "automationType" TEXT NOT NULL,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'PENDING',
    "triggerType" "AutomationTriggerType" NOT NULL DEFAULT 'SCHEDULE',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "runningAttempt" INTEGER,
    "correlationId" TEXT,
    "causationId" TEXT,
    "lastFailureClass" "AutomationFailureClass",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "automationJobId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "automationType" TEXT NOT NULL,
    "triggerType" "AutomationTriggerType" NOT NULL,
    "triggerRef" TEXT,
    "policyKey" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "policyDecision" "AutomationPolicyDecision" NOT NULL,
    "contextFingerprint" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "outcome" "AutomationExecutionOutcome" NOT NULL,
    "producedDomainEffect" BOOLEAN NOT NULL DEFAULT false,
    "retryAllowed" BOOLEAN NOT NULL DEFAULT false,
    "failureClass" "AutomationFailureClass",
    "error" TEXT,
    "principalType" "AutomationPrincipalType" NOT NULL DEFAULT 'AUTOMATION',
    "principalKey" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "activityLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_jobs_status_availableAt_idx" ON "automation_jobs"("status", "availableAt");

-- CreateIndex
CREATE INDEX "automation_jobs_status_nextAttemptAt_idx" ON "automation_jobs"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "automation_jobs_status_leaseExpiresAt_idx" ON "automation_jobs"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "automation_jobs_organizationId_status_idx" ON "automation_jobs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "automation_jobs_organizationId_automationType_sourceType_so_key" ON "automation_jobs"("organizationId", "automationType", "sourceType", "sourceId", "policyVersion", "occurrenceKey");

-- CreateIndex
CREATE INDEX "automation_executions_organizationId_createdAt_idx" ON "automation_executions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_executions_organizationId_outcome_idx" ON "automation_executions"("organizationId", "outcome");

-- CreateIndex
CREATE INDEX "automation_executions_automationJobId_idx" ON "automation_executions"("automationJobId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_executions_automationJobId_attemptNumber_key" ON "automation_executions"("automationJobId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automationJobId_fkey" FOREIGN KEY ("automationJobId") REFERENCES "automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

