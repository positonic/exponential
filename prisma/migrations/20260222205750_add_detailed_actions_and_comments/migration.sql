-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "enableDetailedActions" BOOLEAN;

-- AlterTable
ALTER TABLE "public"."Workspace" ADD COLUMN     "enableDetailedActions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."ActionComment" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionComment_actionId_idx" ON "public"."ActionComment"("actionId");

-- CreateIndex
CREATE INDEX "ActionComment_authorId_idx" ON "public"."ActionComment"("authorId");

-- AddForeignKey
ALTER TABLE "public"."ActionComment" ADD CONSTRAINT "ActionComment_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionComment" ADD CONSTRAINT "ActionComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
