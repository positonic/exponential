-- CreateTable
CREATE TABLE "PageLink" (
    "fromPageId" TEXT NOT NULL,
    "toPageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "PageLink_pkey" PRIMARY KEY ("fromPageId","toPageId")
);

-- CreateIndex
CREATE INDEX "PageLink_toPageId_idx" ON "PageLink"("toPageId");

-- CreateIndex
CREATE INDEX "PageLink_workspaceId_idx" ON "PageLink"("workspaceId");

-- AddForeignKey
ALTER TABLE "PageLink" ADD CONSTRAINT "PageLink_fromPageId_fkey" FOREIGN KEY ("fromPageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageLink" ADD CONSTRAINT "PageLink_toPageId_fkey" FOREIGN KEY ("toPageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from every stored bodyDoc, with the same rules as syncPageLinks
-- (src/server/services/pages/page-links.ts): `pageLink` nodes in document
-- order (jsonpath `.**` walks depth-first, arrays in order), first position
-- wins for a repeated target, self-links dropped, and only existing targets in
-- the source page's workspace kept. Pages whose bodyDoc is null (a Markdown
-- body not yet opened in the editor) have no pageLink nodes to index — the
-- Markdown codec has no parse rule for them — and get rows on their next write.
INSERT INTO "PageLink" ("fromPageId", "toPageId", "position", "workspaceId")
SELECT src."id", tgt."id", (MIN(link.ord) - 1)::int, src."workspaceId"
FROM "KnowledgePage" src
CROSS JOIN LATERAL jsonb_path_query(
    src."bodyDoc",
    'strict $.**?(@.type == "pageLink" && @.attrs.pageId.type() == "string").attrs.pageId'
) WITH ORDINALITY AS link(page_id, ord)
JOIN "KnowledgePage" tgt
  ON tgt."id" = link.page_id #>> '{}'
 AND tgt."workspaceId" = src."workspaceId"
WHERE src."bodyDoc" IS NOT NULL
  AND tgt."id" <> src."id"
GROUP BY src."id", tgt."id", src."workspaceId";
