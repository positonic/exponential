-- AlterTable
ALTER TABLE "Setup" ADD COLUMN     "transcriptionSessionId" TEXT;

-- AlterTable
ALTER TABLE "TranscriptionSession" ADD COLUMN     "setupId" TEXT;

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
