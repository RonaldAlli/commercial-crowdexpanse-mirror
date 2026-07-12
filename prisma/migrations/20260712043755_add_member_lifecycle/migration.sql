-- CreateEnum
CREATE TYPE "UserLifecycleState" AS ENUM ('ACTIVE', 'DEACTIVATED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "lifecycleState" "UserLifecycleState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "sessionsValidAfter" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_organizationId_lifecycleState_idx" ON "users"("organizationId", "lifecycleState");

