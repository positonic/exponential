-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "taskManagementConfig" JSONB,
ADD COLUMN     "taskManagementTool" TEXT DEFAULT 'internal';

-- CreateIndex
CREATE INDEX "Project_taskManagementTool_idx" ON "Project"("taskManagementTool");
