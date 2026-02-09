-- AlterTable
ALTER TABLE "public"."NavigationPreference" ADD COLUMN     "showGamification" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."Assistant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "personality" TEXT NOT NULL,
    "instructions" TEXT,
    "userContext" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assistant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assistant_workspaceId_idx" ON "public"."Assistant"("workspaceId");

-- CreateIndex
CREATE INDEX "Assistant_createdById_idx" ON "public"."Assistant"("createdById");

-- AddForeignKey
ALTER TABLE "public"."Assistant" ADD CONSTRAINT "Assistant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assistant" ADD CONSTRAINT "Assistant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
