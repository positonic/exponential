-- CreateTable
CREATE TABLE "public"."WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "triggerTypes" TEXT[],
    "configSchema" JSONB NOT NULL,
    "stepDefinitions" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'manual',
    "cronSchedule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowStep" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowPipelineRun" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "triggeredById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "WorkflowPipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "pipelineRunId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "assistantId" TEXT,
    "tone" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "wordCount" INTEGER,
    "metadata" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_slug_key" ON "public"."WorkflowTemplate"("slug");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_workspaceId_idx" ON "public"."WorkflowDefinition"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_templateId_idx" ON "public"."WorkflowDefinition"("templateId");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_triggerType_idx" ON "public"."WorkflowDefinition"("triggerType");

-- CreateIndex
CREATE INDEX "WorkflowStep_definitionId_idx" ON "public"."WorkflowStep"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_definitionId_order_key" ON "public"."WorkflowStep"("definitionId", "order");

-- CreateIndex
CREATE INDEX "WorkflowPipelineRun_definitionId_idx" ON "public"."WorkflowPipelineRun"("definitionId");

-- CreateIndex
CREATE INDEX "WorkflowPipelineRun_status_idx" ON "public"."WorkflowPipelineRun"("status");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_runId_idx" ON "public"."WorkflowStepRun"("runId");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_stepId_idx" ON "public"."WorkflowStepRun"("stepId");

-- CreateIndex
CREATE INDEX "ContentDraft_workspaceId_idx" ON "public"."ContentDraft"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentDraft_pipelineRunId_idx" ON "public"."ContentDraft"("pipelineRunId");

-- CreateIndex
CREATE INDEX "ContentDraft_platform_idx" ON "public"."ContentDraft"("platform");

-- CreateIndex
CREATE INDEX "ContentDraft_status_idx" ON "public"."ContentDraft"("status");

-- AddForeignKey
ALTER TABLE "public"."WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."WorkflowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowStep" ADD CONSTRAINT "WorkflowStep_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "public"."WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowPipelineRun" ADD CONSTRAINT "WorkflowPipelineRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "public"."WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowPipelineRun" ADD CONSTRAINT "WorkflowPipelineRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "public"."WorkflowPipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "public"."WorkflowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentDraft" ADD CONSTRAINT "ContentDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentDraft" ADD CONSTRAINT "ContentDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentDraft" ADD CONSTRAINT "ContentDraft_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "public"."WorkflowPipelineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentDraft" ADD CONSTRAINT "ContentDraft_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "public"."Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentDraft" ADD CONSTRAINT "ContentDraft_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "public"."ContentDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
