-- Epics become product-scoped.
--
-- `productId` is nullable for the backfill window only. Rows predating this
-- column have no product, and the router treats a null-product epic as
-- linkable from any product in its workspace, so no existing ticket loses its
-- epic link when this lands. Once every row is assigned (see
-- `scripts/backfill-epic-product.ts`), a follow-up migration tightens the
-- column to NOT NULL.
--
-- ON DELETE CASCADE matches Feature's product relation: deleting a product
-- removes the things that describe it. Tickets and actions pointing at a
-- deleted epic fall back to their existing ON DELETE SET NULL.

ALTER TABLE "Epic" ADD COLUMN "productId" TEXT;

CREATE INDEX "Epic_productId_idx" ON "Epic"("productId");

ALTER TABLE "Epic" ADD CONSTRAINT "Epic_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
