/*
  Warnings:

  - Added the required column `configuredByUserId` to the `SlackChannelConfig` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "allowTeamMemberAccess" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SlackChannelConfig" ADD COLUMN     "configuredByUserId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "IntegrationPermission" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "grantedToUserId" TEXT,
    "grantedToTeamId" TEXT,
    "grantedByUserId" TEXT NOT NULL,
    "permissions" TEXT[],
    "scope" TEXT NOT NULL,
    "scopeEntityId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,

    CONSTRAINT "IntegrationPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInteractionHistory" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceId" TEXT,
    "systemUserId" TEXT,
    "externalUserId" TEXT,
    "userName" TEXT,
    "userMessage" TEXT NOT NULL,
    "cleanMessage" TEXT,
    "aiResponse" TEXT NOT NULL,
    "agentId" TEXT,
    "agentName" TEXT,
    "model" TEXT,
    "conversationId" TEXT,
    "messageType" TEXT,
    "intent" TEXT,
    "category" TEXT,
    "responseTime" INTEGER,
    "tokenUsage" JSONB,
    "hadError" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "projectId" TEXT,
    "actionsTaken" JSONB,
    "toolsUsed" TEXT[],
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInteractionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationPermission_integrationId_idx" ON "IntegrationPermission"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationPermission_grantedToUserId_idx" ON "IntegrationPermission"("grantedToUserId");

-- CreateIndex
CREATE INDEX "IntegrationPermission_grantedToTeamId_idx" ON "IntegrationPermission"("grantedToTeamId");

-- CreateIndex
CREATE INDEX "IntegrationPermission_grantedByUserId_idx" ON "IntegrationPermission"("grantedByUserId");

-- CreateIndex
CREATE INDEX "IntegrationPermission_scope_scopeEntityId_idx" ON "IntegrationPermission"("scope", "scopeEntityId");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_systemUserId_idx" ON "AiInteractionHistory"("systemUserId");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_platform_idx" ON "AiInteractionHistory"("platform");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_agentId_idx" ON "AiInteractionHistory"("agentId");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_conversationId_idx" ON "AiInteractionHistory"("conversationId");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_category_idx" ON "AiInteractionHistory"("category");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_intent_idx" ON "AiInteractionHistory"("intent");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_projectId_idx" ON "AiInteractionHistory"("projectId");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_createdAt_idx" ON "AiInteractionHistory"("createdAt");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_platform_systemUserId_idx" ON "AiInteractionHistory"("platform", "systemUserId");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_conversationId_createdAt_idx" ON "AiInteractionHistory"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SlackChannelConfig_configuredByUserId_idx" ON "SlackChannelConfig"("configuredByUserId");

-- AddForeignKey
ALTER TABLE "SlackChannelConfig" ADD CONSTRAINT "SlackChannelConfig_configuredByUserId_fkey" FOREIGN KEY ("configuredByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPermission" ADD CONSTRAINT "IntegrationPermission_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPermission" ADD CONSTRAINT "IntegrationPermission_grantedToUserId_fkey" FOREIGN KEY ("grantedToUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPermission" ADD CONSTRAINT "IntegrationPermission_grantedToTeamId_fkey" FOREIGN KEY ("grantedToTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPermission" ADD CONSTRAINT "IntegrationPermission_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPermission" ADD CONSTRAINT "IntegrationPermission_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteractionHistory" ADD CONSTRAINT "AiInteractionHistory_systemUserId_fkey" FOREIGN KEY ("systemUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteractionHistory" ADD CONSTRAINT "AiInteractionHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
