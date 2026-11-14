-- ADR-0073: sidebar layout is customised per workspace. One row per
-- (user, workspace); a missing row falls back to NavigationPreference.navLayout.

-- CreateTable
CREATE TABLE "WorkspaceNavLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "navLayout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceNavLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceNavLayout_userId_workspaceId_key" ON "WorkspaceNavLayout"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceNavLayout_workspaceId_idx" ON "WorkspaceNavLayout"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceNavLayout" ADD CONSTRAINT "WorkspaceNavLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceNavLayout" ADD CONSTRAINT "WorkspaceNavLayout_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
