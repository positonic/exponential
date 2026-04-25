-- AlterTable
ALTER TABLE "public"."TranscriptionSession" ADD COLUMN     "chunkCount" INTEGER,
ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "embeddingError" TEXT,
ADD COLUMN     "embeddingStatus" TEXT DEFAULT 'none';

-- CreateIndex
CREATE INDEX "TranscriptionSession_embeddingStatus_idx" ON "public"."TranscriptionSession"("embeddingStatus");
