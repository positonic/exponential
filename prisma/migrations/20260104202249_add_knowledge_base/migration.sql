-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "public"."Resource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "rawContent" TEXT,
    "content" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'web_page',
    "mimeType" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3),
    "wordCount" INTEGER,
    "summary" TEXT,
    "tags" TEXT[],
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "tokenCount" INTEGER,
    "startPos" INTEGER,
    "endPos" INTEGER,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resource_userId_idx" ON "public"."Resource"("userId");

-- CreateIndex
CREATE INDEX "Resource_projectId_idx" ON "public"."Resource"("projectId");

-- CreateIndex
CREATE INDEX "Resource_workspaceId_idx" ON "public"."Resource"("workspaceId");

-- CreateIndex
CREATE INDEX "Resource_contentType_idx" ON "public"."Resource"("contentType");

-- CreateIndex
CREATE INDEX "Resource_url_idx" ON "public"."Resource"("url");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_sourceType_sourceId_idx" ON "public"."KnowledgeChunk"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_userId_idx" ON "public"."KnowledgeChunk"("userId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_projectId_idx" ON "public"."KnowledgeChunk"("projectId");

-- AddForeignKey
ALTER TABLE "public"."Resource" ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Resource" ADD CONSTRAINT "Resource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Resource" ADD CONSTRAINT "Resource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
