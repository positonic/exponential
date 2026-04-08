-- CreateEnum
CREATE TYPE "public"."FeatureStatus" AS ENUM ('IDEA', 'DEFINED', 'IN_PROGRESS', 'SHIPPED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."FeatureScopeStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "public"."ResearchType" AS ENUM ('INTERVIEW', 'DESK_RESEARCH', 'EXPERIMENT', 'ANALYTICS', 'SURVEY', 'OBSERVATION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."InsightType" AS ENUM ('PAIN_POINT', 'WISH', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "public"."InsightStatus" AS ENUM ('INBOX', 'TRIAGED', 'LINKED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."TicketType" AS ENUM ('BUG', 'FEATURE', 'CHORE', 'IMPROVEMENT', 'SPIKE', 'RESEARCH');

-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."Action" ADD COLUMN     "ticketId" TEXT;

-- AlterTable
ALTER TABLE "public"."List" ADD COLUMN     "achievements" TEXT,
ADD COLUMN     "cycleGoal" TEXT;

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feature" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vision" TEXT,
    "status" "public"."FeatureStatus" NOT NULL DEFAULT 'IDEA',
    "effort" DOUBLE PRECISION,
    "priority" INTEGER,
    "goalId" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeatureScope" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."FeatureScopeStatus" NOT NULL DEFAULT 'PLANNED',
    "shippedAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserStory" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "scopeId" TEXT,
    "asA" TEXT,
    "iWant" TEXT,
    "soThat" TEXT,
    "acceptanceCriteria" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Research" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "public"."ResearchType" NOT NULL DEFAULT 'OTHER',
    "conductedAt" TIMESTAMP(3),
    "participants" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Insight" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "type" "public"."InsightType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."InsightStatus" NOT NULL DEFAULT 'INBOX',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeatureInsight" (
    "featureId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureInsight_pkey" PRIMARY KEY ("featureId","insightId")
);

-- CreateTable
CREATE TABLE "public"."Ticket" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "type" "public"."TicketType" NOT NULL DEFAULT 'FEATURE',
    "status" "public"."TicketStatus" NOT NULL DEFAULT 'BACKLOG',
    "priority" INTEGER,
    "points" DOUBLE PRECISION,
    "branchName" TEXT,
    "prUrl" TEXT,
    "designUrl" TEXT,
    "specUrl" TEXT,
    "links" JSONB,
    "epicId" TEXT,
    "featureId" TEXT,
    "cycleId" TEXT,
    "scopeId" TEXT,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "blockedByIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TicketTemplate" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "type" "public"."TicketType" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Retrospective" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "cycleId" TEXT,
    "title" TEXT NOT NULL,
    "coversFromDate" TIMESTAMP(3),
    "coversToDate" TIMESTAMP(3),
    "conductedAt" TIMESTAMP(3),
    "participants" TEXT,
    "wentWell" TEXT,
    "wentPoorly" TEXT,
    "actionItems" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retrospective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_workspaceId_idx" ON "public"."Product"("workspaceId");

-- CreateIndex
CREATE INDEX "Product_createdById_idx" ON "public"."Product"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Product_workspaceId_slug_key" ON "public"."Product"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "Feature_productId_idx" ON "public"."Feature"("productId");

-- CreateIndex
CREATE INDEX "Feature_goalId_idx" ON "public"."Feature"("goalId");

-- CreateIndex
CREATE INDEX "Feature_createdById_idx" ON "public"."Feature"("createdById");

-- CreateIndex
CREATE INDEX "Feature_status_idx" ON "public"."Feature"("status");

-- CreateIndex
CREATE INDEX "FeatureScope_featureId_idx" ON "public"."FeatureScope"("featureId");

-- CreateIndex
CREATE INDEX "UserStory_featureId_idx" ON "public"."UserStory"("featureId");

-- CreateIndex
CREATE INDEX "UserStory_scopeId_idx" ON "public"."UserStory"("scopeId");

-- CreateIndex
CREATE INDEX "Research_productId_idx" ON "public"."Research"("productId");

-- CreateIndex
CREATE INDEX "Research_createdById_idx" ON "public"."Research"("createdById");

-- CreateIndex
CREATE INDEX "Insight_researchId_idx" ON "public"."Insight"("researchId");

-- CreateIndex
CREATE INDEX "Insight_status_idx" ON "public"."Insight"("status");

-- CreateIndex
CREATE INDEX "FeatureInsight_insightId_idx" ON "public"."FeatureInsight"("insightId");

-- CreateIndex
CREATE INDEX "Ticket_productId_idx" ON "public"."Ticket"("productId");

-- CreateIndex
CREATE INDEX "Ticket_epicId_idx" ON "public"."Ticket"("epicId");

-- CreateIndex
CREATE INDEX "Ticket_featureId_idx" ON "public"."Ticket"("featureId");

-- CreateIndex
CREATE INDEX "Ticket_cycleId_idx" ON "public"."Ticket"("cycleId");

-- CreateIndex
CREATE INDEX "Ticket_scopeId_idx" ON "public"."Ticket"("scopeId");

-- CreateIndex
CREATE INDEX "Ticket_assigneeId_idx" ON "public"."Ticket"("assigneeId");

-- CreateIndex
CREATE INDEX "Ticket_createdById_idx" ON "public"."Ticket"("createdById");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "public"."Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_type_idx" ON "public"."Ticket"("type");

-- CreateIndex
CREATE INDEX "TicketTemplate_workspaceId_idx" ON "public"."TicketTemplate"("workspaceId");

-- CreateIndex
CREATE INDEX "TicketTemplate_productId_idx" ON "public"."TicketTemplate"("productId");

-- CreateIndex
CREATE INDEX "TicketTemplate_type_idx" ON "public"."TicketTemplate"("type");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_idx" ON "public"."TicketComment"("ticketId");

-- CreateIndex
CREATE INDEX "TicketComment_authorId_idx" ON "public"."TicketComment"("authorId");

-- CreateIndex
CREATE INDEX "Retrospective_workspaceId_idx" ON "public"."Retrospective"("workspaceId");

-- CreateIndex
CREATE INDEX "Retrospective_productId_idx" ON "public"."Retrospective"("productId");

-- CreateIndex
CREATE INDEX "Retrospective_cycleId_idx" ON "public"."Retrospective"("cycleId");

-- CreateIndex
CREATE INDEX "Retrospective_createdById_idx" ON "public"."Retrospective"("createdById");

-- CreateIndex
CREATE INDEX "Action_ticketId_idx" ON "public"."Action"("ticketId");

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feature" ADD CONSTRAINT "Feature_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feature" ADD CONSTRAINT "Feature_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feature" ADD CONSTRAINT "Feature_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureScope" ADD CONSTRAINT "FeatureScope_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserStory" ADD CONSTRAINT "UserStory_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserStory" ADD CONSTRAINT "UserStory_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "public"."FeatureScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Research" ADD CONSTRAINT "Research_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Research" ADD CONSTRAINT "Research_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Insight" ADD CONSTRAINT "Insight_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "public"."Research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureInsight" ADD CONSTRAINT "FeatureInsight_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureInsight" ADD CONSTRAINT "FeatureInsight_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "public"."Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "public"."Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."List"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "public"."FeatureScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketTemplate" ADD CONSTRAINT "TicketTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketTemplate" ADD CONSTRAINT "TicketTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketComment" ADD CONSTRAINT "TicketComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Retrospective" ADD CONSTRAINT "Retrospective_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Retrospective" ADD CONSTRAINT "Retrospective_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Retrospective" ADD CONSTRAINT "Retrospective_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."List"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Retrospective" ADD CONSTRAINT "Retrospective_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
