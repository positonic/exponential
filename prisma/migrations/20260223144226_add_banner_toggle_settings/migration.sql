-- AlterTable
ALTER TABLE "public"."Workspace" ADD COLUMN     "enableDailyPlanBanner" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableWeeklyReviewBanner" BOOLEAN NOT NULL DEFAULT true;
