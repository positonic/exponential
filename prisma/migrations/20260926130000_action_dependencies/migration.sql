-- ActionDependency: promote Action.blockedByIds / blockingIds (TEXT[] with no
-- FK, never mirrored) to a join table with the same shape as
-- TicketDependency. See ADR-0062.

-- CreateTable
CREATE TABLE "ActionDependency" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ActionDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActionDependency_actionId_dependsOnId_key" ON "ActionDependency"("actionId", "dependsOnId");
CREATE INDEX "ActionDependency_actionId_idx" ON "ActionDependency"("actionId");
CREATE INDEX "ActionDependency_dependsOnId_idx" ON "ActionDependency"("dependsOnId");

-- AddForeignKey
ALTER TABLE "ActionDependency" ADD CONSTRAINT "ActionDependency_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionDependency" ADD CONSTRAINT "ActionDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionDependency" ADD CONSTRAINT "ActionDependency_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from the array column. Dangling ids (the referenced action was
-- deleted; the array had no FK) and self-references are dropped, and the
-- actor is attributed to the action's creator, the best record we have.
INSERT INTO "ActionDependency" ("id", "actionId", "dependsOnId", "createdAt", "createdById")
SELECT
    'adep_' || md5(a."id" || ':' || b."dependsOnId"),
    a."id",
    b."dependsOnId",
    a."createdAt",
    a."createdById"
FROM "Action" a
CROSS JOIN LATERAL unnest(a."blockedByIds") AS b("dependsOnId")
JOIN "Action" t ON t."id" = b."dependsOnId"
WHERE b."dependsOnId" <> a."id"
ON CONFLICT ("actionId", "dependsOnId") DO NOTHING;

-- DropColumn
ALTER TABLE "Action" DROP COLUMN "blockedByIds";
ALTER TABLE "Action" DROP COLUMN "blockingIds";
