-- AlterTable
ALTER TABLE "public"."Team" ADD COLUMN     "isOrganization" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."WeeklyReviewSharing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReviewSharing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyReviewSharing_userId_idx" ON "public"."WeeklyReviewSharing"("userId");

-- CreateIndex
CREATE INDEX "WeeklyReviewSharing_teamId_idx" ON "public"."WeeklyReviewSharing"("teamId");

-- CreateIndex
CREATE INDEX "WeeklyReviewSharing_isEnabled_idx" ON "public"."WeeklyReviewSharing"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReviewSharing_userId_teamId_key" ON "public"."WeeklyReviewSharing"("userId", "teamId");

-- CreateIndex
CREATE INDEX "Team_isOrganization_idx" ON "public"."Team"("isOrganization");

-- AddForeignKey
ALTER TABLE "public"."WeeklyReviewSharing" ADD CONSTRAINT "WeeklyReviewSharing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklyReviewSharing" ADD CONSTRAINT "WeeklyReviewSharing_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
