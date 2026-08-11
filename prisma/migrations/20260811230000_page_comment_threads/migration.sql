-- Anchored comments on Knowledge Pages: `threadId` matches a `comment` mark in
-- KnowledgePage.bodyDoc, `parentId` hangs replies off a thread root, `quotedText`
-- snapshots the highlighted span so an orphaned thread still renders, and
-- `resolvedAt` settles a thread without deleting it. All nullable, so existing
-- doc-level comments keep working untouched.

-- AlterTable
ALTER TABLE "KnowledgePageComment" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "quotedText" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "threadId" TEXT;

-- CreateIndex
CREATE INDEX "KnowledgePageComment_threadId_idx" ON "KnowledgePageComment"("threadId");

-- CreateIndex
CREATE INDEX "KnowledgePageComment_parentId_idx" ON "KnowledgePageComment"("parentId");

-- AddForeignKey
ALTER TABLE "KnowledgePageComment" ADD CONSTRAINT "KnowledgePageComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgePageComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
