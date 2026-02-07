/*
  Warnings:

  - A unique constraint covering the columns `[userId,provider]` on the table `CalendarPreference` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."CalendarPreference_userId_key";

-- AlterTable
ALTER TABLE "public"."CalendarPreference" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'google';

-- CreateIndex
CREATE UNIQUE INDEX "CalendarPreference_userId_provider_key" ON "public"."CalendarPreference"("userId", "provider");
