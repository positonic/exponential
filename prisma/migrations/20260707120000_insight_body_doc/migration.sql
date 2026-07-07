-- Insight detail-page rich body (ADR-0024 storage model, third adopter after
-- Feature and KnowledgePage): bodyDoc is the canonical ProseMirror JSON,
-- the existing body column is its derived Markdown projection, docVersion is
-- the optimistic-concurrency guard.

-- AlterTable
ALTER TABLE "public"."Insight" ADD COLUMN     "bodyDoc" JSONB,
ADD COLUMN     "docVersion" INTEGER NOT NULL DEFAULT 0;
