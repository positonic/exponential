-- CreateTable
CREATE TABLE "public"."GoalUpdate" (
    "id" TEXT NOT NULL,
    "goalId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "health" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalUpdate_goalId_idx" ON "public"."GoalUpdate"("goalId");

-- CreateIndex
CREATE INDEX "GoalUpdate_authorId_idx" ON "public"."GoalUpdate"("authorId");

-- CreateIndex
CREATE INDEX "GoalUpdate_createdAt_idx" ON "public"."GoalUpdate"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."GoalUpdate" ADD CONSTRAINT "GoalUpdate_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoalUpdate" ADD CONSTRAINT "GoalUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
