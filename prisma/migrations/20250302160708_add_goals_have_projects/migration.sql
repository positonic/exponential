/*
  Warnings:

  - Added the required column `userId` to the `Outcome` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Outcome" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "_GoalProjects" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_GoalProjects_AB_unique" ON "_GoalProjects"("A", "B");

-- CreateIndex
CREATE INDEX "_GoalProjects_B_index" ON "_GoalProjects"("B");

-- CreateIndex
CREATE INDEX "Outcome_userId_idx" ON "Outcome"("userId");

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GoalProjects" ADD CONSTRAINT "_GoalProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GoalProjects" ADD CONSTRAINT "_GoalProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
