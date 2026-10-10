-- ADR-0068: Positions — who does what in a workspace, for humans and agents
-- alike. Routing data only; access control stays a function of
-- WorkspaceUser.role. A holder is a WorkspaceUser row, so removing a member
-- drops their holdings through the cascade with no application code.

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "remit" TEXT NOT NULL,
    "notAccountableFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionHolder" (
    "positionId" TEXT NOT NULL,
    "workspaceUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionHolder_pkey" PRIMARY KEY ("positionId","workspaceUserId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_workspaceId_title_key" ON "Position"("workspaceId", "title");
CREATE INDEX "Position_workspaceId_idx" ON "Position"("workspaceId");
CREATE INDEX "PositionHolder_workspaceUserId_idx" ON "PositionHolder"("workspaceUserId");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PositionHolder" ADD CONSTRAINT "PositionHolder_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PositionHolder" ADD CONSTRAINT "PositionHolder_workspaceUserId_fkey" FOREIGN KEY ("workspaceUserId") REFERENCES "WorkspaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
