-- CreateTable
CREATE TABLE "EpicTag" (
    "id" TEXT NOT NULL,
    "epicId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpicTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EpicTag_tagId_idx" ON "EpicTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "EpicTag_epicId_tagId_key" ON "EpicTag"("epicId", "tagId");

-- AddForeignKey
ALTER TABLE "EpicTag" ADD CONSTRAINT "EpicTag_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpicTag" ADD CONSTRAINT "EpicTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
