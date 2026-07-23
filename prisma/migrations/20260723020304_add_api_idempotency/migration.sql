-- CreateTable
CREATE TABLE "api_idempotency_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "factId" TEXT,
    "decisionId" TEXT NOT NULL,
    "originalResponse" JSONB NOT NULL,
    "responseDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_idempotency_org_request_key" ON "api_idempotency_records"("organizationId", "requestId");

