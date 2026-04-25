-- CreateEnum
CREATE TYPE "public"."ListType" AS ENUM ('SPRINT', 'BACKLOG', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."ListStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "public"."ViewGroupBy" ADD VALUE 'LIST';

-- AlterTable
ALTER TABLE "public"."Action" ADD COLUMN     "listId" TEXT;

-- CreateTable
CREATE TABLE "public"."List" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "listType" "public"."ListType" NOT NULL DEFAULT 'CUSTOM',
    "status" "public"."ListStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "List_workspaceId_idx" ON "public"."List"("workspaceId");

-- CreateIndex
CREATE INDEX "List_createdById_idx" ON "public"."List"("createdById");

-- CreateIndex
CREATE INDEX "List_status_idx" ON "public"."List"("status");

-- CreateIndex
CREATE UNIQUE INDEX "List_workspaceId_slug_key" ON "public"."List"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "Action_listId_idx" ON "public"."Action"("listId");

-- AddForeignKey
ALTER TABLE "public"."List" ADD CONSTRAINT "List_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."List" ADD CONSTRAINT "List_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."List"("id") ON DELETE SET NULL ON UPDATE CASCADE;
