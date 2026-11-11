-- ChannelLink gains a `kind` (which producer's content an outbound row carries) and the
-- unique relaxes from (provider, externalId) to (provider, externalId, direction, kind)
-- so one room can carry decisions for one scope and meeting summaries for another
-- (decision D-0055). Existing rows keep kind = 'meeting_summary' and stay unique.

-- AlterTable
ALTER TABLE "ChannelLink" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'meeting_summary';

-- DropIndex
DROP INDEX "ChannelLink_provider_externalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ChannelLink_provider_externalId_direction_kind_key" ON "ChannelLink"("provider", "externalId", "direction", "kind");

-- CreateIndex
CREATE INDEX "ChannelLink_projectId_direction_kind_idx" ON "ChannelLink"("projectId", "direction", "kind");

-- CreateIndex
CREATE INDEX "ChannelLink_workspaceId_direction_kind_idx" ON "ChannelLink"("workspaceId", "direction", "kind");

-- CreateTable
CREATE TABLE "OutboundPost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channelLinkId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "serverIntegrationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerEventId" TEXT,
    "sentAt" TIMESTAMP(3),
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundPost_kind_subjectId_event_channelLinkId_key" ON "OutboundPost"("kind", "subjectId", "event", "channelLinkId");

-- CreateIndex
CREATE INDEX "OutboundPost_status_attemptAt_idx" ON "OutboundPost"("status", "attemptAt");

-- CreateIndex
CREATE INDEX "OutboundPost_kind_subjectId_idx" ON "OutboundPost"("kind", "subjectId");

-- CreateIndex
CREATE INDEX "OutboundPost_workspaceId_idx" ON "OutboundPost"("workspaceId");

-- AddForeignKey
ALTER TABLE "OutboundPost" ADD CONSTRAINT "OutboundPost_channelLinkId_fkey" FOREIGN KEY ("channelLinkId") REFERENCES "ChannelLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
