-- AlterTable
ALTER TABLE "public"."GoalComment" ADD COLUMN     "parentUpdateId" TEXT;

-- CreateIndex
CREATE INDEX "GoalComment_parentUpdateId_idx" ON "public"."GoalComment"("parentUpdateId");

-- AddForeignKey
ALTER TABLE "public"."GoalComment" ADD CONSTRAINT "GoalComment_parentUpdateId_fkey" FOREIGN KEY ("parentUpdateId") REFERENCES "public"."GoalUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
