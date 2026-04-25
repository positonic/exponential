-- ============================================================
-- Product Management Plugin v1
-- Single consolidated migration (9 development migrations squashed)
-- ============================================================

-- CreateEnum
CREATE TYPE "public"."FeatureStatus" AS ENUM ('IDEA', 'DEFINED', 'IN_PROGRESS', 'SHIPPED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."FeatureScopeStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "public"."ResearchType" AS ENUM ('INTERVIEW', 'DESK_RESEARCH', 'EXPERIMENT', 'ANALYTICS', 'SURVEY', 'OBSERVATION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."InsightType" AS ENUM ('PAIN_POINT', 'OPPORTUNITY', 'FEEDBACK', 'PERSONA', 'JOURNEY', 'OBSERVATION', 'COMPETITIVE');

-- CreateEnum
CREATE TYPE "public"."InsightStatus" AS ENUM ('INBOX', 'TRIAGED', 'LINKED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."TicketType" AS ENUM ('BUG', 'FEATURE', 'CHORE', 'IMPROVEMENT', 'SPIKE', 'RESEARCH');

-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('BACKLOG', 'NEEDS_REFINEMENT', 'READY_TO_PLAN', 'COMMITTED', 'IN_PROGRESS', 'BLOCKED', 'QA', 'DONE', 'DEPLOYED', 'ARCHIVED');

-- AlterTable: existing models
ALTER TABLE "public"."Action" ADD COLUMN "ticketId" TEXT;

ALTER TABLE "public"."List"
  ADD COLUMN "achievements" TEXT,
  ADD COLUMN "cycleGoal"    TEXT;

ALTER TABLE "public"."Tag" ADD COLUMN "category" TEXT;

-- CreateTable: Product
CREATE TABLE "public"."Product" (
    "id"            TEXT         NOT NULL,
    "name"          TEXT         NOT NULL,
    "slug"          TEXT         NOT NULL,
    "description"   TEXT,
    "icon"          TEXT,
    "color"         TEXT,
    "funTicketIds"  BOOLEAN      NOT NULL DEFAULT false,
    "ticketCounter" INTEGER      NOT NULL DEFAULT 0,
    "workspaceId"   TEXT         NOT NULL,
    "createdById"   TEXT         NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Feature
CREATE TABLE "public"."Feature" (
    "id"          TEXT             NOT NULL,
    "productId"   TEXT             NOT NULL,
    "name"        TEXT             NOT NULL,
    "description" TEXT,
    "vision"      TEXT,
    "status"      "public"."FeatureStatus" NOT NULL DEFAULT 'IDEA',
    "effort"      DOUBLE PRECISION,
    "priority"    INTEGER,
    "goalId"      INTEGER,
    "createdById" TEXT             NOT NULL,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FeatureScope
CREATE TABLE "public"."FeatureScope" (
    "id"           TEXT                         NOT NULL,
    "featureId"    TEXT                         NOT NULL,
    "version"      TEXT                         NOT NULL,
    "description"  TEXT                         NOT NULL,
    "status"       "public"."FeatureScopeStatus" NOT NULL DEFAULT 'PLANNED',
    "shippedAt"    TIMESTAMP(3),
    "displayOrder" INTEGER                      NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3)                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)                 NOT NULL,
    CONSTRAINT "FeatureScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserStory
CREATE TABLE "public"."UserStory" (
    "id"                 TEXT         NOT NULL,
    "featureId"          TEXT         NOT NULL,
    "scopeId"            TEXT,
    "asA"                TEXT,
    "iWant"              TEXT,
    "soThat"             TEXT,
    "acceptanceCriteria" TEXT,
    "displayOrder"       INTEGER      NOT NULL DEFAULT 0,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Research
CREATE TABLE "public"."Research" (
    "id"           TEXT                      NOT NULL,
    "productId"    TEXT                      NOT NULL,
    "title"        TEXT                      NOT NULL,
    "type"         "public"."ResearchType"   NOT NULL DEFAULT 'OTHER',
    "conductedAt"  TIMESTAMP(3),
    "participants" TEXT,
    "notes"        TEXT,
    "createdById"  TEXT                      NOT NULL,
    "createdAt"    TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)              NOT NULL,
    CONSTRAINT "Research_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Insight
CREATE TABLE "public"."Insight" (
    "id"          TEXT                       NOT NULL,
    "productId"   TEXT                       NOT NULL,
    "researchId"  TEXT,
    "type"        "public"."InsightType"     NOT NULL,
    "title"       TEXT                       NOT NULL,
    "body"        TEXT,
    "source"      TEXT,
    "sentiment"   TEXT,
    "description" TEXT                       NOT NULL DEFAULT '',
    "status"      "public"."InsightStatus"   NOT NULL DEFAULT 'INBOX',
    "createdById" TEXT                       NOT NULL,
    "createdAt"   TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)               NOT NULL,
    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable: InsightTag
CREATE TABLE "public"."InsightTag" (
    "id"        TEXT         NOT NULL,
    "insightId" TEXT         NOT NULL,
    "tagId"     TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsightTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FeatureInsight
CREATE TABLE "public"."FeatureInsight" (
    "featureId" TEXT         NOT NULL,
    "insightId" TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureInsight_pkey" PRIMARY KEY ("featureId", "insightId")
);

-- CreateTable: Ticket
CREATE TABLE "public"."Ticket" (
    "id"          TEXT                     NOT NULL,
    "productId"   TEXT                     NOT NULL,
    "number"      INTEGER                  NOT NULL DEFAULT 0,
    "shortId"     TEXT,
    "title"       TEXT                     NOT NULL,
    "body"        TEXT,
    "type"        "public"."TicketType"    NOT NULL DEFAULT 'FEATURE',
    "status"      "public"."TicketStatus"  NOT NULL DEFAULT 'BACKLOG',
    "priority"    INTEGER,
    "points"      DOUBLE PRECISION,
    "branchName"  TEXT,
    "prUrl"       TEXT,
    "designUrl"   TEXT,
    "specUrl"     TEXT,
    "links"       JSONB,
    "epicId"      TEXT,
    "featureId"   TEXT,
    "cycleId"     TEXT,
    "scopeId"     TEXT,
    "createdById" TEXT                     NOT NULL,
    "assigneeId"  TEXT,
    "createdAt"   TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)             NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TicketDependency
CREATE TABLE "public"."TicketDependency" (
    "id"          TEXT         NOT NULL,
    "ticketId"    TEXT         NOT NULL,
    "dependsOnId" TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "TicketDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TicketTemplate
CREATE TABLE "public"."TicketTemplate" (
    "id"          TEXT                    NOT NULL,
    "productId"   TEXT,
    "workspaceId" TEXT                    NOT NULL,
    "type"        "public"."TicketType"   NOT NULL,
    "name"        TEXT                    NOT NULL,
    "body"        TEXT                    NOT NULL,
    "isDefault"   BOOLEAN                 NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)            NOT NULL,
    CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TicketComment
CREATE TABLE "public"."TicketComment" (
    "id"        TEXT         NOT NULL,
    "ticketId"  TEXT         NOT NULL,
    "authorId"  TEXT         NOT NULL,
    "content"   TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TicketTag
CREATE TABLE "public"."TicketTag" (
    "id"        TEXT         NOT NULL,
    "ticketId"  TEXT         NOT NULL,
    "tagId"     TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FeatureTag
CREATE TABLE "public"."FeatureTag" (
    "id"        TEXT         NOT NULL,
    "featureId" TEXT         NOT NULL,
    "tagId"     TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Retrospective
CREATE TABLE "public"."Retrospective" (
    "id"            TEXT         NOT NULL,
    "workspaceId"   TEXT         NOT NULL,
    "productId"     TEXT,
    "cycleId"       TEXT,
    "title"         TEXT         NOT NULL,
    "coversFromDate" TIMESTAMP(3),
    "coversToDate"  TIMESTAMP(3),
    "conductedAt"   TIMESTAMP(3),
    "participants"  TEXT,
    "wentWell"      TEXT,
    "wentPoorly"    TEXT,
    "actionItems"   TEXT,
    "notes"         TEXT,
    "createdById"   TEXT         NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Retrospective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_workspaceId_idx" ON "public"."Product"("workspaceId");
CREATE INDEX "Product_createdById_idx" ON "public"."Product"("createdById");
CREATE UNIQUE INDEX "Product_workspaceId_slug_key" ON "public"."Product"("workspaceId", "slug");

CREATE INDEX "Feature_productId_idx" ON "public"."Feature"("productId");
CREATE INDEX "Feature_goalId_idx" ON "public"."Feature"("goalId");
CREATE INDEX "Feature_createdById_idx" ON "public"."Feature"("createdById");
CREATE INDEX "Feature_status_idx" ON "public"."Feature"("status");

CREATE INDEX "FeatureScope_featureId_idx" ON "public"."FeatureScope"("featureId");

CREATE INDEX "UserStory_featureId_idx" ON "public"."UserStory"("featureId");
CREATE INDEX "UserStory_scopeId_idx" ON "public"."UserStory"("scopeId");

CREATE INDEX "Research_productId_idx" ON "public"."Research"("productId");
CREATE INDEX "Research_createdById_idx" ON "public"."Research"("createdById");

CREATE INDEX "Insight_productId_idx" ON "public"."Insight"("productId");
CREATE INDEX "Insight_researchId_idx" ON "public"."Insight"("researchId");
CREATE INDEX "Insight_status_idx" ON "public"."Insight"("status");
CREATE INDEX "Insight_type_idx" ON "public"."Insight"("type");
CREATE INDEX "Insight_createdById_idx" ON "public"."Insight"("createdById");

CREATE INDEX "InsightTag_tagId_idx" ON "public"."InsightTag"("tagId");
CREATE UNIQUE INDEX "InsightTag_insightId_tagId_key" ON "public"."InsightTag"("insightId", "tagId");

CREATE INDEX "FeatureInsight_insightId_idx" ON "public"."FeatureInsight"("insightId");

CREATE INDEX "Ticket_productId_idx" ON "public"."Ticket"("productId");
CREATE INDEX "Ticket_epicId_idx" ON "public"."Ticket"("epicId");
CREATE INDEX "Ticket_featureId_idx" ON "public"."Ticket"("featureId");
CREATE INDEX "Ticket_cycleId_idx" ON "public"."Ticket"("cycleId");
CREATE INDEX "Ticket_scopeId_idx" ON "public"."Ticket"("scopeId");
CREATE INDEX "Ticket_assigneeId_idx" ON "public"."Ticket"("assigneeId");
CREATE INDEX "Ticket_createdById_idx" ON "public"."Ticket"("createdById");
CREATE INDEX "Ticket_status_idx" ON "public"."Ticket"("status");
CREATE INDEX "Ticket_type_idx" ON "public"."Ticket"("type");
CREATE UNIQUE INDEX "Ticket_productId_number_key" ON "public"."Ticket"("productId", "number");
CREATE UNIQUE INDEX "Ticket_productId_shortId_key" ON "public"."Ticket"("productId", "shortId");

CREATE INDEX "TicketDependency_ticketId_idx" ON "public"."TicketDependency"("ticketId");
CREATE INDEX "TicketDependency_dependsOnId_idx" ON "public"."TicketDependency"("dependsOnId");
CREATE UNIQUE INDEX "TicketDependency_ticketId_dependsOnId_key" ON "public"."TicketDependency"("ticketId", "dependsOnId");

CREATE INDEX "TicketTemplate_workspaceId_idx" ON "public"."TicketTemplate"("workspaceId");
CREATE INDEX "TicketTemplate_productId_idx" ON "public"."TicketTemplate"("productId");
CREATE INDEX "TicketTemplate_type_idx" ON "public"."TicketTemplate"("type");

CREATE INDEX "TicketComment_ticketId_idx" ON "public"."TicketComment"("ticketId");
CREATE INDEX "TicketComment_authorId_idx" ON "public"."TicketComment"("authorId");

CREATE INDEX "TicketTag_tagId_idx" ON "public"."TicketTag"("tagId");
CREATE UNIQUE INDEX "TicketTag_ticketId_tagId_key" ON "public"."TicketTag"("ticketId", "tagId");

CREATE INDEX "FeatureTag_tagId_idx" ON "public"."FeatureTag"("tagId");
CREATE UNIQUE INDEX "FeatureTag_featureId_tagId_key" ON "public"."FeatureTag"("featureId", "tagId");

CREATE INDEX "Retrospective_workspaceId_idx" ON "public"."Retrospective"("workspaceId");
CREATE INDEX "Retrospective_productId_idx" ON "public"."Retrospective"("productId");
CREATE INDEX "Retrospective_cycleId_idx" ON "public"."Retrospective"("cycleId");
CREATE INDEX "Retrospective_createdById_idx" ON "public"."Retrospective"("createdById");

CREATE INDEX "Action_ticketId_idx" ON "public"."Action"("ticketId");

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Feature" ADD CONSTRAINT "Feature_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Feature" ADD CONSTRAINT "Feature_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Feature" ADD CONSTRAINT "Feature_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."FeatureScope" ADD CONSTRAINT "FeatureScope_featureId_fkey"
  FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."UserStory" ADD CONSTRAINT "UserStory_featureId_fkey"
  FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."UserStory" ADD CONSTRAINT "UserStory_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "public"."FeatureScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Research" ADD CONSTRAINT "Research_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Research" ADD CONSTRAINT "Research_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Insight" ADD CONSTRAINT "Insight_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Insight" ADD CONSTRAINT "Insight_researchId_fkey"
  FOREIGN KEY ("researchId") REFERENCES "public"."Research"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Insight" ADD CONSTRAINT "Insight_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."InsightTag" ADD CONSTRAINT "InsightTag_insightId_fkey"
  FOREIGN KEY ("insightId") REFERENCES "public"."Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."InsightTag" ADD CONSTRAINT "InsightTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."FeatureInsight" ADD CONSTRAINT "FeatureInsight_featureId_fkey"
  FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."FeatureInsight" ADD CONSTRAINT "FeatureInsight_insightId_fkey"
  FOREIGN KEY ("insightId") REFERENCES "public"."Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_epicId_fkey"
  FOREIGN KEY ("epicId") REFERENCES "public"."Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_featureId_fkey"
  FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "public"."List"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "public"."FeatureScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."TicketDependency" ADD CONSTRAINT "TicketDependency_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."TicketDependency" ADD CONSTRAINT "TicketDependency_dependsOnId_fkey"
  FOREIGN KEY ("dependsOnId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."TicketDependency" ADD CONSTRAINT "TicketDependency_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."TicketTemplate" ADD CONSTRAINT "TicketTemplate_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."TicketTemplate" ADD CONSTRAINT "TicketTemplate_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."TicketComment" ADD CONSTRAINT "TicketComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."TicketTag" ADD CONSTRAINT "TicketTag_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."TicketTag" ADD CONSTRAINT "TicketTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."FeatureTag" ADD CONSTRAINT "FeatureTag_featureId_fkey"
  FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."FeatureTag" ADD CONSTRAINT "FeatureTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."Retrospective" ADD CONSTRAINT "Retrospective_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Retrospective" ADD CONSTRAINT "Retrospective_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Retrospective" ADD CONSTRAINT "Retrospective_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "public"."List"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Retrospective" ADD CONSTRAINT "Retrospective_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
