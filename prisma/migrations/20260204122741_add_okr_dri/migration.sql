-- AlterTable
ALTER TABLE "public"."Goal" ADD COLUMN     "driUserId" TEXT;

-- AlterTable
ALTER TABLE "public"."KeyResult" ADD COLUMN     "driUserId" TEXT;

-- CreateIndex
CREATE INDEX "Goal_driUserId_idx" ON "public"."Goal"("driUserId");

-- CreateIndex
CREATE INDEX "KeyResult_driUserId_idx" ON "public"."KeyResult"("driUserId");

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_driUserId_fkey" FOREIGN KEY ("driUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResult" ADD CONSTRAINT "KeyResult_driUserId_fkey" FOREIGN KEY ("driUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
