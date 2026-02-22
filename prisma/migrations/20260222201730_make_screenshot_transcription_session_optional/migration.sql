-- DropForeignKey
ALTER TABLE "public"."Screenshot" DROP CONSTRAINT "Screenshot_transcriptionSessionId_fkey";

-- AlterTable
ALTER TABLE "public"."Screenshot" ALTER COLUMN "transcriptionSessionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Screenshot" ADD CONSTRAINT "Screenshot_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "public"."TranscriptionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
