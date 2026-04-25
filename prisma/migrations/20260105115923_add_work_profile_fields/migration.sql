-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "usagePurposes" TEXT[],
ADD COLUMN     "workFunction" TEXT[],
ADD COLUMN     "workRole" TEXT;
