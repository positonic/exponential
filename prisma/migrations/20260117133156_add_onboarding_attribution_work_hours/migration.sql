-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "attributionSource" TEXT,
ADD COLUMN     "workDaysJson" TEXT,
ADD COLUMN     "workHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workHoursEnd" TEXT DEFAULT '17:00',
ADD COLUMN     "workHoursStart" TEXT DEFAULT '09:00';
