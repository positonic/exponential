-- AlterTable
ALTER TABLE "public"."Goal" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "whyThisGoal" TEXT;

-- CreateTable
CREATE TABLE "public"."Habit" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "daysOfWeek" INTEGER[],
    "timeOfDay" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "goalId" INTEGER,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HabitCompletion" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "completedDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "duration" INTEGER,
    "rating" INTEGER,

    CONSTRAINT "HabitCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Habit_userId_idx" ON "public"."Habit"("userId");

-- CreateIndex
CREATE INDEX "Habit_goalId_idx" ON "public"."Habit"("goalId");

-- CreateIndex
CREATE INDEX "Habit_isActive_idx" ON "public"."Habit"("isActive");

-- CreateIndex
CREATE INDEX "HabitCompletion_habitId_idx" ON "public"."HabitCompletion"("habitId");

-- CreateIndex
CREATE INDEX "HabitCompletion_completedDate_idx" ON "public"."HabitCompletion"("completedDate");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCompletion_habitId_completedDate_key" ON "public"."HabitCompletion"("habitId", "completedDate");

-- AddForeignKey
ALTER TABLE "public"."Habit" ADD CONSTRAINT "Habit_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HabitCompletion" ADD CONSTRAINT "HabitCompletion_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "public"."Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
