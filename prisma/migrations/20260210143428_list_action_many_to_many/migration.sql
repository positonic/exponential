/*
  Warnings:

  - You are about to drop the column `listId` on the `Action` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Action" DROP CONSTRAINT "Action_listId_fkey";

-- DropIndex
DROP INDEX "public"."Action_listId_idx";

-- AlterTable
ALTER TABLE "public"."Action" DROP COLUMN "listId";

-- CreateTable
CREATE TABLE "public"."ActionList" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionList_actionId_idx" ON "public"."ActionList"("actionId");

-- CreateIndex
CREATE INDEX "ActionList_listId_idx" ON "public"."ActionList"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionList_actionId_listId_key" ON "public"."ActionList"("actionId", "listId");

-- AddForeignKey
ALTER TABLE "public"."ActionList" ADD CONSTRAINT "ActionList_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionList" ADD CONSTRAINT "ActionList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
