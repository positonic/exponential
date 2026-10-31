-- Databases (ADR-0078): a typed set of Rows inside a Page. Additive.
--   * `PageDatabase` is the block's schema and saved view, owned by its holding page;
--   * a Row is a `KnowledgePage` with `databaseId` set and its values in `properties`;
--   * `DatabaseRelation` is the edge table for relation values (created now, written in V3);
--   * revisions snapshot a Row's `properties` beside its body.
-- The GIN index at the end serves the `properties @> …` filters `compileRowQuery` emits.

-- CreateEnum
CREATE TYPE "DatabaseRelationTargetKind" AS ENUM ('ROW', 'TICKET', 'PROJECT', 'FEATURE', 'GOAL', 'KEY_RESULT', 'PAGE');

-- AlterTable
ALTER TABLE "KnowledgePage" ADD COLUMN     "databaseId" TEXT,
ADD COLUMN     "properties" JSONB;

-- AlterTable
ALTER TABLE "KnowledgePageRevision" ADD COLUMN     "properties" JSONB;

-- CreateTable
CREATE TABLE "PageDatabase" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "properties" JSONB NOT NULL,
    "view" JSONB NOT NULL,
    "titlePropertyId" TEXT NOT NULL,
    "detachedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseRelation" (
    "id" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "rowPageId" TEXT NOT NULL,
    "targetKind" "DatabaseRelationTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetRowPageId" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "DatabaseRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageDatabase_pageId_idx" ON "PageDatabase"("pageId");

-- CreateIndex
CREATE INDEX "PageDatabase_workspaceId_idx" ON "PageDatabase"("workspaceId");

-- CreateIndex
CREATE INDEX "DatabaseRelation_targetKind_targetId_idx" ON "DatabaseRelation"("targetKind", "targetId");

-- CreateIndex
CREATE INDEX "DatabaseRelation_databaseId_idx" ON "DatabaseRelation"("databaseId");

-- CreateIndex
CREATE INDEX "DatabaseRelation_targetRowPageId_idx" ON "DatabaseRelation"("targetRowPageId");

-- CreateIndex
CREATE UNIQUE INDEX "DatabaseRelation_rowPageId_propertyId_targetKind_targetId_key" ON "DatabaseRelation"("rowPageId", "propertyId", "targetKind", "targetId");

-- CreateIndex
CREATE INDEX "KnowledgePage_databaseId_idx" ON "KnowledgePage"("databaseId");

-- AddForeignKey
ALTER TABLE "KnowledgePage" ADD CONSTRAINT "KnowledgePage_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "PageDatabase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDatabase" ADD CONSTRAINT "PageDatabase_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDatabase" ADD CONSTRAINT "PageDatabase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDatabase" ADD CONSTRAINT "PageDatabase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseRelation" ADD CONSTRAINT "DatabaseRelation_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "PageDatabase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseRelation" ADD CONSTRAINT "DatabaseRelation_rowPageId_fkey" FOREIGN KEY ("rowPageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseRelation" ADD CONSTRAINT "DatabaseRelation_targetRowPageId_fkey" FOREIGN KEY ("targetRowPageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row filters (`properties @> '{"<propertyId>": <value>}'`) use the GIN index;
-- hand-written, as the hnsw index in 20260426075815_merge_one2b_agent_schema was.
CREATE INDEX "KnowledgePage_properties_gin_idx" ON "KnowledgePage" USING GIN ("properties" jsonb_path_ops);
