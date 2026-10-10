-- AlterTable
ALTER TABLE "ChannelLink" ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'inbound',
ADD COLUMN     "serverIntegrationId" TEXT;

-- CreateTable
CREATE TABLE "MatrixPostLog" (
    "id" TEXT NOT NULL,
    "transcriptionSessionId" TEXT NOT NULL,
    "channelLinkId" TEXT,
    "roomId" TEXT NOT NULL,
    "serverIntegrationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatrixPostLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatrixPostLog_transcriptionSessionId_roomId_idx" ON "MatrixPostLog"("transcriptionSessionId", "roomId");

-- CreateIndex
CREATE INDEX "MatrixPostLog_serverIntegrationId_idx" ON "MatrixPostLog"("serverIntegrationId");

-- CreateIndex
CREATE INDEX "MatrixPostLog_channelLinkId_idx" ON "MatrixPostLog"("channelLinkId");

-- CreateIndex
CREATE INDEX "MatrixPostLog_postedById_idx" ON "MatrixPostLog"("postedById");

-- CreateIndex
CREATE INDEX "ChannelLink_projectId_direction_idx" ON "ChannelLink"("projectId", "direction");

-- CreateIndex
CREATE INDEX "ChannelLink_workspaceId_direction_idx" ON "ChannelLink"("workspaceId", "direction");

-- CreateIndex
CREATE INDEX "ChannelLink_serverIntegrationId_idx" ON "ChannelLink"("serverIntegrationId");

-- AddForeignKey
ALTER TABLE "ChannelLink" ADD CONSTRAINT "ChannelLink_serverIntegrationId_fkey" FOREIGN KEY ("serverIntegrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixPostLog" ADD CONSTRAINT "MatrixPostLog_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixPostLog" ADD CONSTRAINT "MatrixPostLog_channelLinkId_fkey" FOREIGN KEY ("channelLinkId") REFERENCES "ChannelLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixPostLog" ADD CONSTRAINT "MatrixPostLog_serverIntegrationId_fkey" FOREIGN KEY ("serverIntegrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixPostLog" ADD CONSTRAINT "MatrixPostLog_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
