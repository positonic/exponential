-- CreateTable
CREATE TABLE "public"."GoalComment" (
    "id" TEXT NOT NULL,
    "goalId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KeyResultComment" (
    "id" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyResultComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalComment_goalId_idx" ON "public"."GoalComment"("goalId");

-- CreateIndex
CREATE INDEX "GoalComment_authorId_idx" ON "public"."GoalComment"("authorId");

-- CreateIndex
CREATE INDEX "GoalComment_createdAt_idx" ON "public"."GoalComment"("createdAt");

-- CreateIndex
CREATE INDEX "KeyResultComment_keyResultId_idx" ON "public"."KeyResultComment"("keyResultId");

-- CreateIndex
CREATE INDEX "KeyResultComment_authorId_idx" ON "public"."KeyResultComment"("authorId");

-- CreateIndex
CREATE INDEX "KeyResultComment_createdAt_idx" ON "public"."KeyResultComment"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."GoalComment" ADD CONSTRAINT "GoalComment_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoalComment" ADD CONSTRAINT "GoalComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResultComment" ADD CONSTRAINT "KeyResultComment_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "public"."KeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResultComment" ADD CONSTRAINT "KeyResultComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
