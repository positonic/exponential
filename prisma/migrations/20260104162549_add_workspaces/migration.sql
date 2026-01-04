-- AlterTable
ALTER TABLE "public"."Action" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "public"."Goal" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "public"."Outcome" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "public"."Team" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "defaultWorkspaceId" TEXT;

-- CreateTable
CREATE TABLE "public"."Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'personal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "public"."Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_slug_idx" ON "public"."Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "public"."Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Workspace_type_idx" ON "public"."Workspace"("type");

-- CreateIndex
CREATE INDEX "WorkspaceUser_userId_idx" ON "public"."WorkspaceUser"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_workspaceId_idx" ON "public"."WorkspaceUser"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUser_userId_workspaceId_key" ON "public"."WorkspaceUser"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "Action_workspaceId_idx" ON "public"."Action"("workspaceId");

-- CreateIndex
CREATE INDEX "Goal_workspaceId_idx" ON "public"."Goal"("workspaceId");

-- CreateIndex
CREATE INDEX "Outcome_workspaceId_idx" ON "public"."Outcome"("workspaceId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_idx" ON "public"."Project"("workspaceId");

-- CreateIndex
CREATE INDEX "Team_workspaceId_idx" ON "public"."Team"("workspaceId");

-- AddForeignKey
ALTER TABLE "public"."Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Outcome" ADD CONSTRAINT "Outcome_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
