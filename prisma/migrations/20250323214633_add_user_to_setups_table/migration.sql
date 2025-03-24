/*
  Warnings:

  - Added the required column `userId` to the `Setup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Setup" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Setup_userId_idx" ON "Setup"("userId");

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
