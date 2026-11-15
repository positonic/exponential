-- Billing V1 (metering): the usage ledger and its per-month counter. Both
-- tables are new and start empty, and nothing writes to them unless
-- BILLING_MODE is "meter" or "enforce".

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "modelId" TEXT,
    "costMicros" INTEGER NOT NULL,
    "onOwnKey" BOOLEAN NOT NULL DEFAULT false,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceUsagePeriod" (
    "workspaceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "costMicros" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "WorkspaceUsagePeriod_pkey" PRIMARY KEY ("workspaceId","periodStart")
);

-- CreateIndex
CREATE INDEX "UsageEvent_workspaceId_createdAt_idx" ON "UsageEvent"("workspaceId", "createdAt");
