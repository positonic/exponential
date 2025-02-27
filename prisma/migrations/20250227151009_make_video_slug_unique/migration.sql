/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Video` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Video_slug_key" ON "Video"("slug");
