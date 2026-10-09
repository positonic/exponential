-- Invite-only Pages (ADR-0067). Additive: the flag defaults to false, so every
-- existing Page keeps its current workspace/project visibility.

-- AlterTable
ALTER TABLE "KnowledgePage" ADD COLUMN     "isInviteOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "KnowledgePageMember" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgePageMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgePageMember_userId_idx" ON "KnowledgePageMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePageMember_pageId_userId_key" ON "KnowledgePageMember"("pageId", "userId");

-- AddForeignKey
ALTER TABLE "KnowledgePageMember" ADD CONSTRAINT "KnowledgePageMember_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePageMember" ADD CONSTRAINT "KnowledgePageMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePageMember" ADD CONSTRAINT "KnowledgePageMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

