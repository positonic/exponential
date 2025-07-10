-- AlterTable
ALTER TABLE "TranscriptionSession" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "TranscriptionSession_projectId_idx" ON "TranscriptionSession"("projectId");

-- AddForeignKey
ALTER TABLE "TranscriptionSession" ADD CONSTRAINT "TranscriptionSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
