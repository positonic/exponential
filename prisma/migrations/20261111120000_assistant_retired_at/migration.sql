-- ADR-0072: one Assistant per person. A retired Assistant keeps its row (and its
-- principal, so its history stays attributed); `retiredAt` marks it.

-- AlterTable
ALTER TABLE "Assistant" ADD COLUMN     "retiredAt" TIMESTAMP(3);
