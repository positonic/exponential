-- AlterTable
ALTER TABLE "public"."Workspace" ADD COLUMN     "enableEmailNotifications" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."WorkspaceNotificationOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceNotificationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceNotificationOverride_userId_idx" ON "public"."WorkspaceNotificationOverride"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceNotificationOverride_workspaceId_idx" ON "public"."WorkspaceNotificationOverride"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceNotificationOverride_userId_workspaceId_key" ON "public"."WorkspaceNotificationOverride"("userId", "workspaceId");

-- AddForeignKey
ALTER TABLE "public"."WorkspaceNotificationOverride" ADD CONSTRAINT "WorkspaceNotificationOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceNotificationOverride" ADD CONSTRAINT "WorkspaceNotificationOverride_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
