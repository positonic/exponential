-- Reading list (ticket pink.grape): a read state on Resource.
-- New rows default to "to_read"; everything that already exists was saved as
-- reference material, not as a queue, so it is backfilled to "read".

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "readStatus" TEXT NOT NULL DEFAULT 'to_read',
ADD COLUMN     "readAt" TIMESTAMP(3);

-- Backfill existing rows
UPDATE "Resource" SET "readStatus" = 'read', "readAt" = "createdAt";

-- CreateIndex
CREATE INDEX "Resource_userId_readStatus_idx" ON "Resource"("userId", "readStatus");
