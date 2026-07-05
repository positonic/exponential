/*
  Warnings:

  - A unique constraint covering the columns `[publicId]` on the table `KnowledgePage` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "KnowledgePage" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicId" TEXT,
ADD COLUMN     "publicSeoIndexed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicSlug" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePage_publicId_key" ON "KnowledgePage"("publicId");
