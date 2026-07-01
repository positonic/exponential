-- ADR-0036: fold Problem into Insight. Step 1 of 2.
-- Adds the PROBLEM insight type and the general triage columns. Kept in a
-- SEPARATE migration from the data backfill because PostgreSQL forbids using a
-- newly added enum value in the same transaction that adds it — the backfill in
-- 20260701142028_fold_problem_into_insight references 'PROBLEM'.

-- AlterEnum
ALTER TYPE "public"."InsightType" ADD VALUE 'PROBLEM';

-- AlterTable
ALTER TABLE "public"."Insight" ADD COLUMN     "impact" INTEGER,
ADD COLUMN     "confidence" INTEGER,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "evidence" TEXT,
ADD COLUMN     "parkedAt" TIMESTAMP(3),
ADD COLUMN     "parkReason" TEXT;
