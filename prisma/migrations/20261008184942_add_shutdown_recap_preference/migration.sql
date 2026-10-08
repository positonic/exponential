-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "shutdownRecap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shutdownRecapTime" TEXT DEFAULT '18:00';
