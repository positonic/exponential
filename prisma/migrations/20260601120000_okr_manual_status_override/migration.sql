-- ADR-0004: manual status override stored beside the auto-derived value.
-- Six nullable columns, no backfill (null = no override = today's behaviour).
-- The existing auto columns (Goal.health, KeyResult.status) are untouched.

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "healthOverride" TEXT;
ALTER TABLE "Goal" ADD COLUMN "healthOverrideAt" TIMESTAMP(3);
ALTER TABLE "Goal" ADD COLUMN "healthOverrideById" TEXT;

-- AlterTable
ALTER TABLE "KeyResult" ADD COLUMN "statusOverride" TEXT;
ALTER TABLE "KeyResult" ADD COLUMN "statusOverrideAt" TIMESTAMP(3);
ALTER TABLE "KeyResult" ADD COLUMN "statusOverrideById" TEXT;
