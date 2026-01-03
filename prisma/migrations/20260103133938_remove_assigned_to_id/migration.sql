/*
  Warnings:

  - You are about to drop the column `assignedToId` on the `Action` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Action" DROP CONSTRAINT "Action_assignedToId_fkey";

-- DropIndex
DROP INDEX "public"."Action_assignedToId_idx";

-- AlterTable
ALTER TABLE "public"."Action" DROP COLUMN "assignedToId";
