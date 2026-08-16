-- Cycles (List rows with listType SPRINT) become product-scoped so different
-- products can run cycles with overlapping dates. NULL productId = legacy
-- workspace-shared cycle.

-- AlterTable
ALTER TABLE "List" ADD COLUMN "productId" TEXT;

-- CreateIndex
CREATE INDEX "List_productId_idx" ON "List"("productId");

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: a cycle whose tickets all belong to exactly one product is that
-- product's cycle. Cycles with no tickets or mixed-product tickets stay NULL
-- (workspace-shared) and remain visible on every product's Cycles tab.
UPDATE "List" l
SET "productId" = t.pid
FROM (
  SELECT "cycleId", MIN("productId") AS pid
  FROM "Ticket"
  WHERE "cycleId" IS NOT NULL AND "productId" IS NOT NULL
  GROUP BY "cycleId"
  HAVING COUNT(DISTINCT "productId") = 1
) t
WHERE l.id = t."cycleId" AND l."listType" = 'SPRINT';
