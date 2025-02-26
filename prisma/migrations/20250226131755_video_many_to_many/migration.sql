/*
  Warnings:

  - You are about to drop the column `userId` on the `Video` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[videoUrl]` on the table `Video` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Video" DROP CONSTRAINT "Video_userId_fkey";

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "userId";

-- CreateTable
CREATE TABLE "UserVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserVideo_userId_idx" ON "UserVideo"("userId");

-- CreateIndex
CREATE INDEX "UserVideo_videoId_idx" ON "UserVideo"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "UserVideo_userId_videoId_key" ON "UserVideo"("userId", "videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Video_videoUrl_key" ON "Video"("videoUrl");

-- AddForeignKey
ALTER TABLE "UserVideo" ADD CONSTRAINT "UserVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVideo" ADD CONSTRAINT "UserVideo_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
