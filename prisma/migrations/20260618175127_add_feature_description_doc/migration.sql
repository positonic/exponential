-- AlterTable
ALTER TABLE "Feature" ADD COLUMN     "descriptionDoc" JSONB,
ADD COLUMN     "docVersion" INTEGER NOT NULL DEFAULT 0;
