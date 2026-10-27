-- Page revisions, second step (ADR-0074, decisions of 2026-10-27).
-- Additive, and safe on a database that already ran 20261027120000:
--   * revisions snapshot provenance (`source`, `asOf`) so restore can put it back;
--   * `bodyBytes` is stored at write time so listing history never reads bodies;
--   * the seeded starting rows become honest `baseline` rows: no author, since the
--     page's creator did not necessarily write its current text (ADR-0071).

-- AlterTable
ALTER TABLE "KnowledgePageRevision" ADD COLUMN "source" TEXT,
ADD COLUMN "asOf" TIMESTAMP(3),
ADD COLUMN "bodyBytes" INTEGER NOT NULL DEFAULT 0;

-- Backfill sizes.
UPDATE "KnowledgePageRevision" SET "bodyBytes" = COALESCE(octet_length("body"), 0);

-- The rows 20261027120000 seeded, recognised by the note it wrote.
UPDATE "KnowledgePageRevision" r
SET "kind" = 'baseline',
    "authorId" = NULL,
    "note" = 'Content as it stood when page history was introduced',
    "source" = p."source",
    "asOf" = p."asOf"
FROM "KnowledgePage" p
WHERE r."pageId" = p."id"
  AND r."kind" = 'create'
  AND r."note" = 'Baseline captured when page history was introduced';
