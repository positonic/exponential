-- CreateTable
CREATE TABLE "public"."OkrCheckin" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "facilitatorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OkrCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OkrCheckinUpdate" (
    "id" TEXT NOT NULL,
    "okrCheckinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accomplishments" TEXT,
    "blockers" TEXT,
    "priorities" TEXT,
    "isSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OkrCheckinUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OkrCheckinComment" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OkrCheckinComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OkrCheckinAgendaItem" (
    "id" TEXT NOT NULL,
    "okrCheckinId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 5,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OkrCheckinAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OkrCheckin_teamId_idx" ON "public"."OkrCheckin"("teamId");

-- CreateIndex
CREATE INDEX "OkrCheckin_workspaceId_idx" ON "public"."OkrCheckin"("workspaceId");

-- CreateIndex
CREATE INDEX "OkrCheckin_weekStartDate_idx" ON "public"."OkrCheckin"("weekStartDate");

-- CreateIndex
CREATE INDEX "OkrCheckin_status_idx" ON "public"."OkrCheckin"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OkrCheckin_teamId_weekStartDate_key" ON "public"."OkrCheckin"("teamId", "weekStartDate");

-- CreateIndex
CREATE INDEX "OkrCheckinUpdate_okrCheckinId_idx" ON "public"."OkrCheckinUpdate"("okrCheckinId");

-- CreateIndex
CREATE INDEX "OkrCheckinUpdate_userId_idx" ON "public"."OkrCheckinUpdate"("userId");

-- CreateIndex
CREATE INDEX "OkrCheckinUpdate_isSubmitted_idx" ON "public"."OkrCheckinUpdate"("isSubmitted");

-- CreateIndex
CREATE UNIQUE INDEX "OkrCheckinUpdate_okrCheckinId_userId_key" ON "public"."OkrCheckinUpdate"("okrCheckinId", "userId");

-- CreateIndex
CREATE INDEX "OkrCheckinComment_updateId_idx" ON "public"."OkrCheckinComment"("updateId");

-- CreateIndex
CREATE INDEX "OkrCheckinComment_authorId_idx" ON "public"."OkrCheckinComment"("authorId");

-- CreateIndex
CREATE INDEX "OkrCheckinAgendaItem_okrCheckinId_idx" ON "public"."OkrCheckinAgendaItem"("okrCheckinId");

-- AddForeignKey
ALTER TABLE "public"."OkrCheckin" ADD CONSTRAINT "OkrCheckin_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OkrCheckin" ADD CONSTRAINT "OkrCheckin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OkrCheckin" ADD CONSTRAINT "OkrCheckin_facilitatorId_fkey" FOREIGN KEY ("facilitatorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OkrCheckinUpdate" ADD CONSTRAINT "OkrCheckinUpdate_okrCheckinId_fkey" FOREIGN KEY ("okrCheckinId") REFERENCES "public"."OkrCheckin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OkrCheckinUpdate" ADD CONSTRAINT "OkrCheckinUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OkrCheckinComment" ADD CONSTRAINT "OkrCheckinComment_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "public"."OkrCheckinUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OkrCheckinComment" ADD CONSTRAINT "OkrCheckinComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OkrCheckinAgendaItem" ADD CONSTRAINT "OkrCheckinAgendaItem_okrCheckinId_fkey" FOREIGN KEY ("okrCheckinId") REFERENCES "public"."OkrCheckin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
