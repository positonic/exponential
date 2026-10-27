-- Page history and provenance (ADR-0074).
-- Additive: two nullable columns on KnowledgePage and a new snapshot table.

-- AlterTable
ALTER TABLE "KnowledgePage" ADD COLUMN "source" TEXT,
ADD COLUMN "asOf" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KnowledgePageRevision" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "docVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "bodyDoc" JSONB,
    "source" TEXT,
    "asOf" TIMESTAMP(3),
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgePageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgePageRevision_pageId_createdAt_idx" ON "KnowledgePageRevision"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgePageRevision_authorId_idx" ON "KnowledgePageRevision"("authorId");

-- AddForeignKey
ALTER TABLE "KnowledgePageRevision" ADD CONSTRAINT "KnowledgePageRevision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePageRevision" ADD CONSTRAINT "KnowledgePageRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed one unattributed "baseline" revision per existing page: the content as
-- it stood when history was introduced. No author and the page's updatedAt as
-- the timestamp — the only two things we actually know (ADR-0071 record
-- integrity: the creator may not have written the current text).
INSERT INTO "KnowledgePageRevision" ("id", "pageId", "docVersion", "title", "body", "bodyDoc", "source", "asOf", "kind", "note", "authorId", "createdAt", "updatedAt")
SELECT
  'rev_' || md5(random()::text || p."id"),
  p."id",
  p."docVersion",
  p."title",
  p."body",
  p."bodyDoc",
  p."source",
  p."asOf",
  'baseline',
  'Content as it stood when page history was introduced',
  NULL,
  p."updatedAt",
  p."updatedAt"
FROM "KnowledgePage" p;
