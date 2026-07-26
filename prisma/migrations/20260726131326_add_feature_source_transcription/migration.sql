-- AlterTable
ALTER TABLE "Feature" ADD COLUMN     "sourceTranscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "Feature_sourceTranscriptionId_idx" ON "Feature"("sourceTranscriptionId");

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_sourceTranscriptionId_fkey" FOREIGN KEY ("sourceTranscriptionId") REFERENCES "TranscriptionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
