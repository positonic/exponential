/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
