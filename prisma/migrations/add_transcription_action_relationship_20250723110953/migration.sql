-- AlterTable
ALTER TABLE "Action" ADD COLUMN "transcriptionSessionId" TEXT;

-- AlterTable
ALTER TABLE "TranscriptionSession" ADD COLUMN "sourceIntegrationId" TEXT;

-- CreateIndex
CREATE INDEX "Action_transcriptionSessionId_idx" ON "Action"("transcriptionSessionId");

-- CreateIndex
CREATE INDEX "TranscriptionSession_sourceIntegrationId_idx" ON "TranscriptionSession"("sourceIntegrationId");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptionSession" ADD CONSTRAINT "TranscriptionSession_sourceIntegrationId_fkey" FOREIGN KEY ("sourceIntegrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;