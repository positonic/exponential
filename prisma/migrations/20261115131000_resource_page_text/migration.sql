-- Page text (ticket damp.gem): the visible text of a saved page that has no
-- Article body, kept apart from `content` so it is indexed for search and
-- never rendered by a reader. Nullable, no backfill: existing rows have none.

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "pageText" TEXT;
