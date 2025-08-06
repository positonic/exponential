-- AlterTable
ALTER TABLE "TranscriptionSession" ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "slackNotificationAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SlackChannelConfig" (
    "id" TEXT NOT NULL,
    "slackChannel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "projectId" TEXT,
    "teamId" TEXT,
    "integrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackChannelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackChannelConfig_projectId_key" ON "SlackChannelConfig"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackChannelConfig_teamId_key" ON "SlackChannelConfig"("teamId");

-- CreateIndex
CREATE INDEX "SlackChannelConfig_projectId_idx" ON "SlackChannelConfig"("projectId");

-- CreateIndex
CREATE INDEX "SlackChannelConfig_teamId_idx" ON "SlackChannelConfig"("teamId");

-- CreateIndex
CREATE INDEX "SlackChannelConfig_integrationId_idx" ON "SlackChannelConfig"("integrationId");

-- AddForeignKey
ALTER TABLE "SlackChannelConfig" ADD CONSTRAINT "SlackChannelConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackChannelConfig" ADD CONSTRAINT "SlackChannelConfig_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackChannelConfig" ADD CONSTRAINT "SlackChannelConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
