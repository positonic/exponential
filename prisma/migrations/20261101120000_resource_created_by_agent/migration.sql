-- ADR-0079: an agent saves Resources to its OWNER's list and records itself as
-- the author.
ALTER TABLE "Resource" ADD COLUMN "createdByAgentId" TEXT;

ALTER TABLE "Resource" ADD CONSTRAINT "Resource_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "ExternalAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: rows saved before this change landed on the agent's shadow user,
-- where no one can see them. Hand each one to the agent's owner, unless the
-- owner already saved the same URL (the save dedupes on URL, so the owner's
-- own row wins and the shadow copy stays where it is).
UPDATE "Resource" r
SET "userId" = ea."ownerId",
    "createdByAgentId" = ea."id"
FROM "ExternalAgent" ea
WHERE r."userId" = ea."shadowUserId"
  AND (
    r."url" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "Resource" o
      WHERE o."userId" = ea."ownerId" AND o."url" = r."url"
    )
  );

-- Chunks copy the Resource's owner; keep them in step so the owner's search
-- finds what moved.
UPDATE "KnowledgeChunk" kc
SET "userId" = r."userId"
FROM "Resource" r
WHERE kc."sourceType" = 'resource'
  AND kc."sourceId" = r."id"
  AND r."createdByAgentId" IS NOT NULL
  AND kc."userId" IS DISTINCT FROM r."userId";
