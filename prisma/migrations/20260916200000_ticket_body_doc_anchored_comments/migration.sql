-- Ticket: canonical ProseMirror body + optimistic-concurrency version
-- (ADR-0024 storage model, as Feature.descriptionDoc/docVersion).
-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "bodyDoc" JSONB;
ALTER TABLE "Ticket" ADD COLUMN "docVersion" INTEGER NOT NULL DEFAULT 0;

-- TicketComment: anchored-comment threading (as FeatureComment).
-- AlterTable
ALTER TABLE "TicketComment" ADD COLUMN "threadId" TEXT;
ALTER TABLE "TicketComment" ADD COLUMN "parentId" TEXT;
ALTER TABLE "TicketComment" ADD COLUMN "quotedText" TEXT;
ALTER TABLE "TicketComment" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TicketComment_threadId_idx" ON "TicketComment"("threadId");

-- CreateIndex
CREATE INDEX "TicketComment_parentId_idx" ON "TicketComment"("parentId");

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TicketComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
