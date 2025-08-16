-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "kanbanStatus" "ActionStatus";

-- CreateIndex
CREATE INDEX "Action_kanbanStatus_idx" ON "Action"("kanbanStatus");
