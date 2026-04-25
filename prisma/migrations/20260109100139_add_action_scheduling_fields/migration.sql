-- AlterTable
ALTER TABLE "public"."Action" ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "scheduledEnd" TIMESTAMP(3),
ADD COLUMN     "scheduledStart" TIMESTAMP(3);
