-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Action_createdById_idx" ON "Action"("createdById");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
