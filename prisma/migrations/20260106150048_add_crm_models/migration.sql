-- CreateTable
CREATE TABLE "public"."CrmContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedIn" TEXT,
    "telegram" TEXT,
    "twitter" TEXT,
    "github" TEXT,
    "about" TEXT,
    "skills" TEXT[],
    "tags" TEXT[],
    "lastInteractionAt" TIMESTAMP(3),
    "lastInteractionType" TEXT,
    "organizationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CrmOrganization" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CrmContactInteraction" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "subject" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmContactInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CrmCommunication" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromEmail" TEXT,
    "toEmail" TEXT,
    "fromTelegram" TEXT,
    "toTelegram" TEXT,
    "subject" TEXT,
    "textContent" TEXT,
    "htmlContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CrmCommunicationTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "textContent" TEXT,
    "htmlContent" TEXT,
    "type" TEXT NOT NULL,
    "variables" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCommunicationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmContact_workspaceId_idx" ON "public"."CrmContact"("workspaceId");

-- CreateIndex
CREATE INDEX "CrmContact_organizationId_idx" ON "public"."CrmContact"("organizationId");

-- CreateIndex
CREATE INDEX "CrmContact_createdById_idx" ON "public"."CrmContact"("createdById");

-- CreateIndex
CREATE INDEX "CrmContact_email_idx" ON "public"."CrmContact"("email");

-- CreateIndex
CREATE INDEX "CrmContact_lastInteractionAt_idx" ON "public"."CrmContact"("lastInteractionAt");

-- CreateIndex
CREATE INDEX "CrmOrganization_workspaceId_idx" ON "public"."CrmOrganization"("workspaceId");

-- CreateIndex
CREATE INDEX "CrmOrganization_createdById_idx" ON "public"."CrmOrganization"("createdById");

-- CreateIndex
CREATE INDEX "CrmOrganization_name_idx" ON "public"."CrmOrganization"("name");

-- CreateIndex
CREATE INDEX "CrmContactInteraction_contactId_idx" ON "public"."CrmContactInteraction"("contactId");

-- CreateIndex
CREATE INDEX "CrmContactInteraction_userId_idx" ON "public"."CrmContactInteraction"("userId");

-- CreateIndex
CREATE INDEX "CrmContactInteraction_type_idx" ON "public"."CrmContactInteraction"("type");

-- CreateIndex
CREATE INDEX "CrmContactInteraction_createdAt_idx" ON "public"."CrmContactInteraction"("createdAt");

-- CreateIndex
CREATE INDEX "CrmCommunication_contactId_idx" ON "public"."CrmCommunication"("contactId");

-- CreateIndex
CREATE INDEX "CrmCommunication_workspaceId_idx" ON "public"."CrmCommunication"("workspaceId");

-- CreateIndex
CREATE INDEX "CrmCommunication_createdById_idx" ON "public"."CrmCommunication"("createdById");

-- CreateIndex
CREATE INDEX "CrmCommunication_status_idx" ON "public"."CrmCommunication"("status");

-- CreateIndex
CREATE INDEX "CrmCommunication_type_idx" ON "public"."CrmCommunication"("type");

-- CreateIndex
CREATE INDEX "CrmCommunication_sentAt_idx" ON "public"."CrmCommunication"("sentAt");

-- CreateIndex
CREATE INDEX "CrmCommunicationTemplate_workspaceId_idx" ON "public"."CrmCommunicationTemplate"("workspaceId");

-- CreateIndex
CREATE INDEX "CrmCommunicationTemplate_type_idx" ON "public"."CrmCommunicationTemplate"("type");

-- CreateIndex
CREATE INDEX "CrmCommunicationTemplate_isActive_idx" ON "public"."CrmCommunicationTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCommunicationTemplate_workspaceId_name_key" ON "public"."CrmCommunicationTemplate"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "public"."CrmContact" ADD CONSTRAINT "CrmContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmContact" ADD CONSTRAINT "CrmContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CrmOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmContact" ADD CONSTRAINT "CrmContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmOrganization" ADD CONSTRAINT "CrmOrganization_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmOrganization" ADD CONSTRAINT "CrmOrganization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmContactInteraction" ADD CONSTRAINT "CrmContactInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmContactInteraction" ADD CONSTRAINT "CrmContactInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmCommunication" ADD CONSTRAINT "CrmCommunication_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmCommunication" ADD CONSTRAINT "CrmCommunication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmCommunication" ADD CONSTRAINT "CrmCommunication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmCommunicationTemplate" ADD CONSTRAINT "CrmCommunicationTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmCommunicationTemplate" ADD CONSTRAINT "CrmCommunicationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
