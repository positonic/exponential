-- CreateTable
CREATE TABLE "public"."WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_token_key" ON "public"."WorkspaceInvitation"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_token_idx" ON "public"."WorkspaceInvitation"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_email_idx" ON "public"."WorkspaceInvitation"("email");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_workspaceId_idx" ON "public"."WorkspaceInvitation"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_status_idx" ON "public"."WorkspaceInvitation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_workspaceId_email_key" ON "public"."WorkspaceInvitation"("workspaceId", "email");

-- AddForeignKey
ALTER TABLE "public"."WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
