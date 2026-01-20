-- AlterTable
ALTER TABLE "public"."TranscriptionSession" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "TranscriptionSession_workspaceId_idx" ON "public"."TranscriptionSession"("workspaceId");

-- AddForeignKey
ALTER TABLE "public"."TranscriptionSession" ADD CONSTRAINT "TranscriptionSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
