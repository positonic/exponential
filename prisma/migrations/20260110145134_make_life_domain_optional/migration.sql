-- DropForeignKey
ALTER TABLE "public"."Goal" DROP CONSTRAINT "Goal_lifeDomainId_fkey";

-- AlterTable
ALTER TABLE "public"."Goal" ALTER COLUMN "lifeDomainId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_lifeDomainId_fkey" FOREIGN KEY ("lifeDomainId") REFERENCES "public"."LifeDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
