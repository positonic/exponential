-- CreateTable
CREATE TABLE "KnowledgePageComment" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgePageComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgePageComment_pageId_idx" ON "KnowledgePageComment"("pageId");

-- CreateIndex
CREATE INDEX "KnowledgePageComment_createdById_idx" ON "KnowledgePageComment"("createdById");

-- AddForeignKey
ALTER TABLE "KnowledgePageComment" ADD CONSTRAINT "KnowledgePageComment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePageComment" ADD CONSTRAINT "KnowledgePageComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

