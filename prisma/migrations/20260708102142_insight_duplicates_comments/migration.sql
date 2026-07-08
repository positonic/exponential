-- AlterTable
ALTER TABLE "Insight" ADD COLUMN     "duplicateOfId" TEXT;

-- CreateTable
CREATE TABLE "InsightComment" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightComment_insightId_idx" ON "InsightComment"("insightId");

-- CreateIndex
CREATE INDEX "InsightComment_authorId_idx" ON "InsightComment"("authorId");

-- CreateIndex
CREATE INDEX "Insight_duplicateOfId_idx" ON "Insight"("duplicateOfId");

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Insight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightComment" ADD CONSTRAINT "InsightComment_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightComment" ADD CONSTRAINT "InsightComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
