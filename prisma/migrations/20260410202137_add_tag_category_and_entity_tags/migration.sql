-- AlterTable
ALTER TABLE "public"."Tag" ADD COLUMN     "category" TEXT;

-- CreateTable
CREATE TABLE "public"."TicketTag" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeatureTag" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketTag_tagId_idx" ON "public"."TicketTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTag_ticketId_tagId_key" ON "public"."TicketTag"("ticketId", "tagId");

-- CreateIndex
CREATE INDEX "FeatureTag_tagId_idx" ON "public"."FeatureTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureTag_featureId_tagId_key" ON "public"."FeatureTag"("featureId", "tagId");

-- AddForeignKey
ALTER TABLE "public"."TicketTag" ADD CONSTRAINT "TicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketTag" ADD CONSTRAINT "TicketTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureTag" ADD CONSTRAINT "FeatureTag_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureTag" ADD CONSTRAINT "FeatureTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
