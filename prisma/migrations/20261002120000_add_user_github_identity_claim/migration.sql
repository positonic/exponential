-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubId" TEXT,
ADD COLUMN     "githubLinkedAt" TIMESTAMP(3),
ADD COLUMN     "githubLogin" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

