-- CreateTable
CREATE TABLE "public"."NavigationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hiddenItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavigationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NavigationPreference_userId_key" ON "public"."NavigationPreference"("userId");

-- CreateIndex
CREATE INDEX "NavigationPreference_userId_idx" ON "public"."NavigationPreference"("userId");

-- AddForeignKey
ALTER TABLE "public"."NavigationPreference" ADD CONSTRAINT "NavigationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
