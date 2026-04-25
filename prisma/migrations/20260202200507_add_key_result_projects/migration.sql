-- CreateTable
CREATE TABLE "public"."KeyResultProject" (
    "id" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyResultProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeyResultProject_keyResultId_idx" ON "public"."KeyResultProject"("keyResultId");

-- CreateIndex
CREATE INDEX "KeyResultProject_projectId_idx" ON "public"."KeyResultProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "KeyResultProject_keyResultId_projectId_key" ON "public"."KeyResultProject"("keyResultId", "projectId");

-- AddForeignKey
ALTER TABLE "public"."KeyResultProject" ADD CONSTRAINT "KeyResultProject_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "public"."KeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KeyResultProject" ADD CONSTRAINT "KeyResultProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
