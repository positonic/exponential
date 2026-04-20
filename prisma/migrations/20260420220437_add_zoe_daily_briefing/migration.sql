-- AlterTable
ALTER TABLE "public"."NavigationPreference" ADD COLUMN     "showDailyBriefing" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."DailyBriefing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "date" DATE NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "outputText" TEXT NOT NULL,
    "outputStructured" JSONB,
    "latencyMs" INTEGER,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BriefingInteraction" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefingInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyBriefing_userId_date_idx" ON "public"."DailyBriefing"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyBriefing_promptVersion_idx" ON "public"."DailyBriefing"("promptVersion");

-- CreateIndex
CREATE INDEX "DailyBriefing_createdAt_idx" ON "public"."DailyBriefing"("createdAt");

-- CreateIndex
CREATE INDEX "BriefingInteraction_briefingId_idx" ON "public"."BriefingInteraction"("briefingId");

-- CreateIndex
CREATE INDEX "BriefingInteraction_type_idx" ON "public"."BriefingInteraction"("type");

-- CreateIndex
CREATE INDEX "BriefingInteraction_createdAt_idx" ON "public"."BriefingInteraction"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."DailyBriefing" ADD CONSTRAINT "DailyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyBriefing" ADD CONSTRAINT "DailyBriefing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BriefingInteraction" ADD CONSTRAINT "BriefingInteraction_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "public"."DailyBriefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
