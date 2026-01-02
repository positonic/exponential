-- AlterTable
ALTER TABLE "public"."LifeDomain" ADD COLUMN     "color" TEXT,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."WheelOfLifeAssessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT NOT NULL DEFAULT 'quick',
    "type" TEXT NOT NULL DEFAULT 'on_demand',
    "quarterYear" TEXT,
    "notes" TEXT,

    CONSTRAINT "WheelOfLifeAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WheelOfLifeScore" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "lifeDomainId" INTEGER NOT NULL,
    "currentRank" INTEGER NOT NULL,
    "desiredRank" INTEGER NOT NULL,
    "score" INTEGER,
    "reflection" TEXT,

    CONSTRAINT "WheelOfLifeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WheelOfLifeRecommendation" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "lifeDomainId" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "suggestedGoal" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "goalCreated" BOOLEAN NOT NULL DEFAULT false,
    "goalId" INTEGER,

    CONSTRAINT "WheelOfLifeRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WheelOfLifeAssessment_userId_idx" ON "public"."WheelOfLifeAssessment"("userId");

-- CreateIndex
CREATE INDEX "WheelOfLifeAssessment_completedAt_idx" ON "public"."WheelOfLifeAssessment"("completedAt");

-- CreateIndex
CREATE INDEX "WheelOfLifeAssessment_quarterYear_idx" ON "public"."WheelOfLifeAssessment"("quarterYear");

-- CreateIndex
CREATE INDEX "WheelOfLifeScore_assessmentId_idx" ON "public"."WheelOfLifeScore"("assessmentId");

-- CreateIndex
CREATE INDEX "WheelOfLifeScore_lifeDomainId_idx" ON "public"."WheelOfLifeScore"("lifeDomainId");

-- CreateIndex
CREATE UNIQUE INDEX "WheelOfLifeScore_assessmentId_lifeDomainId_key" ON "public"."WheelOfLifeScore"("assessmentId", "lifeDomainId");

-- CreateIndex
CREATE INDEX "WheelOfLifeRecommendation_assessmentId_idx" ON "public"."WheelOfLifeRecommendation"("assessmentId");

-- CreateIndex
CREATE INDEX "WheelOfLifeRecommendation_lifeDomainId_idx" ON "public"."WheelOfLifeRecommendation"("lifeDomainId");

-- AddForeignKey
ALTER TABLE "public"."WheelOfLifeAssessment" ADD CONSTRAINT "WheelOfLifeAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WheelOfLifeScore" ADD CONSTRAINT "WheelOfLifeScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."WheelOfLifeAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WheelOfLifeScore" ADD CONSTRAINT "WheelOfLifeScore_lifeDomainId_fkey" FOREIGN KEY ("lifeDomainId") REFERENCES "public"."LifeDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WheelOfLifeRecommendation" ADD CONSTRAINT "WheelOfLifeRecommendation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."WheelOfLifeAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
