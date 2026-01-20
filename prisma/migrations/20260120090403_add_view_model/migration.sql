-- CreateEnum
CREATE TYPE "public"."ViewType" AS ENUM ('KANBAN', 'LIST');

-- CreateEnum
CREATE TYPE "public"."ViewGroupBy" AS ENUM ('STATUS', 'PROJECT', 'ASSIGNEE', 'PRIORITY');

-- CreateTable
CREATE TABLE "public"."View" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "viewType" "public"."ViewType" NOT NULL DEFAULT 'KANBAN',
    "groupBy" "public"."ViewGroupBy" NOT NULL DEFAULT 'STATUS',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "sortConfig" JSONB NOT NULL DEFAULT '{}',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "View_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "View_workspaceId_idx" ON "public"."View"("workspaceId");

-- CreateIndex
CREATE INDEX "View_createdById_idx" ON "public"."View"("createdById");

-- CreateIndex
CREATE INDEX "View_isSystem_idx" ON "public"."View"("isSystem");

-- CreateIndex
CREATE UNIQUE INDEX "View_workspaceId_slug_key" ON "public"."View"("workspaceId", "slug");

-- AddForeignKey
ALTER TABLE "public"."View" ADD CONSTRAINT "View_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."View" ADD CONSTRAINT "View_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
