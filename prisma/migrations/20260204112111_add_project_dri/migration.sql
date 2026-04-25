-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "driId" TEXT;

-- CreateIndex
CREATE INDEX "Project_driId_idx" ON "public"."Project"("driId");

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_driId_fkey" FOREIGN KEY ("driId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
