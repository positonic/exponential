-- Person page handles (V3): an opt-in vanity name for `/people/<handle>`.
-- Nullable, so nobody gets one until they pick it in profile settings; unique
-- across the whole install. Stored lowercase by the app (`src/lib/personHandle.ts`).
-- New nullable column and index, no backfill.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "handle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
