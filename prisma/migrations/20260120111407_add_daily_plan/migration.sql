-- CreateTable
CREATE TABLE "public"."DailyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "date" DATE NOT NULL,
    "shutdownTime" TEXT,
    "obstacles" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyPlanAction" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "actionId" TEXT,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPlanAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyPlan_userId_idx" ON "public"."DailyPlan"("userId");

-- CreateIndex
CREATE INDEX "DailyPlan_workspaceId_idx" ON "public"."DailyPlan"("workspaceId");

-- CreateIndex
CREATE INDEX "DailyPlan_date_idx" ON "public"."DailyPlan"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_userId_date_workspaceId_key" ON "public"."DailyPlan"("userId", "date", "workspaceId");

-- CreateIndex
CREATE INDEX "DailyPlanAction_dailyPlanId_idx" ON "public"."DailyPlanAction"("dailyPlanId");

-- CreateIndex
CREATE INDEX "DailyPlanAction_actionId_idx" ON "public"."DailyPlanAction"("actionId");

-- AddForeignKey
ALTER TABLE "public"."DailyPlan" ADD CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyPlan" ADD CONSTRAINT "DailyPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyPlanAction" ADD CONSTRAINT "DailyPlanAction_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "public"."DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyPlanAction" ADD CONSTRAINT "DailyPlanAction_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;
