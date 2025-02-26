/*
  Warnings:

  - You are about to drop the column `projectId` on the `Outcome` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Outcome" DROP CONSTRAINT "Outcome_projectId_fkey";

-- DropIndex
DROP INDEX "Outcome_projectId_idx";

-- AlterTable
ALTER TABLE "Outcome" DROP COLUMN "projectId";

-- CreateTable
CREATE TABLE "Week" (
    "id" SERIAL NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weekId" INTEGER NOT NULL,

    CONSTRAINT "Day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserExercise" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "dayId" INTEGER NOT NULL,

    CONSTRAINT "UserExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "lifeDomainId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifeDomain" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "LifeDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "dayId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProjectOutcomes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_GoalOutcomes" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Day_weekId_idx" ON "Day"("weekId");

-- CreateIndex
CREATE INDEX "UserExercise_userId_idx" ON "UserExercise"("userId");

-- CreateIndex
CREATE INDEX "UserExercise_exerciseId_idx" ON "UserExercise"("exerciseId");

-- CreateIndex
CREATE INDEX "UserExercise_dayId_idx" ON "UserExercise"("dayId");

-- CreateIndex
CREATE INDEX "Goal_lifeDomainId_idx" ON "Goal"("lifeDomainId");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE INDEX "Journal_dayId_idx" ON "Journal"("dayId");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectOutcomes_AB_unique" ON "_ProjectOutcomes"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectOutcomes_B_index" ON "_ProjectOutcomes"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_GoalOutcomes_AB_unique" ON "_GoalOutcomes"("A", "B");

-- CreateIndex
CREATE INDEX "_GoalOutcomes_B_index" ON "_GoalOutcomes"("B");

-- AddForeignKey
ALTER TABLE "Day" ADD CONSTRAINT "Day_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserExercise" ADD CONSTRAINT "UserExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserExercise" ADD CONSTRAINT "UserExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserExercise" ADD CONSTRAINT "UserExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_lifeDomainId_fkey" FOREIGN KEY ("lifeDomainId") REFERENCES "LifeDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectOutcomes" ADD CONSTRAINT "_ProjectOutcomes_A_fkey" FOREIGN KEY ("A") REFERENCES "Outcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectOutcomes" ADD CONSTRAINT "_ProjectOutcomes_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GoalOutcomes" ADD CONSTRAINT "_GoalOutcomes_A_fkey" FOREIGN KEY ("A") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GoalOutcomes" ADD CONSTRAINT "_GoalOutcomes_B_fkey" FOREIGN KEY ("B") REFERENCES "Outcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
