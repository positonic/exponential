-- 20261031120000_page_databases created this index, but the schema did not
-- declare it, so `prisma migrate dev` wanted to drop it. The schema declares it
-- now; this migration is a no-op where the index exists and restores it where
-- the generated drop was applied.
CREATE INDEX IF NOT EXISTS "KnowledgePage_properties_gin_idx" ON "KnowledgePage" USING GIN ("properties" jsonb_path_ops);
