-- CreateTable
CREATE TABLE "acquisition_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalCalls" INTEGER NOT NULL DEFAULT 100,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "acquisition_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acquisition_sessions_organizationId_userId_endedAt_idx" ON "acquisition_sessions"("organizationId", "userId", "endedAt");

-- AddForeignKey
ALTER TABLE "acquisition_sessions" ADD CONSTRAINT "acquisition_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acquisition_sessions" ADD CONSTRAINT "acquisition_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
