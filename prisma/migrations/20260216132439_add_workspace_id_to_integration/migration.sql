-- AlterTable
ALTER TABLE "public"."Integration" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "Integration_workspaceId_idx" ON "public"."Integration"("workspaceId");

-- AddForeignKey
ALTER TABLE "public"."Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
