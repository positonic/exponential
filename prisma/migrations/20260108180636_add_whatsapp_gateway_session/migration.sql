-- CreateTable
CREATE TABLE "public"."WhatsAppGatewaySession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastPingAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "WhatsAppGatewaySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PluginConfig" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KeyResult" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'percent',
    "unitLabel" TEXT,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'on-track',
    "confidence" INTEGER,
    "goalId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KeyResultCheckIn" (
    "id" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION NOT NULL,
    "newValue" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "KeyResultCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppGatewaySession_sessionId_key" ON "public"."WhatsAppGatewaySession"("sessionId");

-- CreateIndex
CREATE INDEX "WhatsAppGatewaySession_userId_idx" ON "public"."WhatsAppGatewaySession"("userId");

-- CreateIndex
CREATE INDEX "WhatsAppGatewaySession_status_idx" ON "public"."WhatsAppGatewaySession"("status");

-- CreateIndex
CREATE INDEX "WhatsAppGatewaySession_sessionId_idx" ON "public"."WhatsAppGatewaySession"("sessionId");

-- CreateIndex
CREATE INDEX "PluginConfig_pluginId_idx" ON "public"."PluginConfig"("pluginId");

-- CreateIndex
CREATE INDEX "PluginConfig_workspaceId_idx" ON "public"."PluginConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "PluginConfig_userId_idx" ON "public"."PluginConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfig_pluginId_workspaceId_userId_key" ON "public"."PluginConfig"("pluginId", "workspaceId", "userId");

-- CreateIndex
CREATE INDEX "KeyResult_goalId_idx" ON "public"."KeyResult"("goalId");

-- CreateIndex
CREATE INDEX "KeyResult_userId_idx" ON "public"."KeyResult"("userId");

-- CreateIndex
CREATE INDEX "KeyResult_workspaceId_idx" ON "public"."KeyResult"("workspaceId");

-- CreateIndex
CREATE INDEX "KeyResult_period_idx" ON "public"."KeyResult"("period");

-- CreateIndex
CREATE INDEX "KeyResult_status_idx" ON "public"."KeyResult"("status");

-- CreateIndex
CREATE INDEX "KeyResultCheckIn_keyResultId_idx" ON "public"."KeyResultCheckIn"("keyResultId");

-- CreateIndex
CREATE INDEX "KeyResultCheckIn_createdAt_idx" ON "public"."KeyResultCheckIn"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."WhatsAppGatewaySession" ADD CONSTRAINT "WhatsAppGatewaySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PluginConfig" ADD CONSTRAINT "PluginConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PluginConfig" ADD CONSTRAINT "PluginConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResult" ADD CONSTRAINT "KeyResult_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResult" ADD CONSTRAINT "KeyResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResult" ADD CONSTRAINT "KeyResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResultCheckIn" ADD CONSTRAINT "KeyResultCheckIn_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "public"."KeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResultCheckIn" ADD CONSTRAINT "KeyResultCheckIn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
