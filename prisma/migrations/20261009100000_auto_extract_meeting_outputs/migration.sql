-- AlterTable
ALTER TABLE "Ceremony" ADD COLUMN     "autoExtractOutputs" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TranscriptionSession" ADD COLUMN     "outputsExtractedAt" TIMESTAMP(3);
