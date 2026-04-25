/*
  Warnings:

  - You are about to drop the column `errorMessage` on the `CrmCommunication` table. All the data in the column will be lost.
  - You are about to drop the column `fromEmail` on the `CrmCommunication` table. All the data in the column will be lost.
  - You are about to drop the column `fromTelegram` on the `CrmCommunication` table. All the data in the column will be lost.
  - You are about to drop the column `toEmail` on the `CrmCommunication` table. All the data in the column will be lost.
  - You are about to drop the column `toTelegram` on the `CrmCommunication` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `CrmContact` table. All the data in the column will be lost.
  - You are about to drop the column `github` on the `CrmContact` table. All the data in the column will be lost.
  - You are about to drop the column `linkedIn` on the `CrmContact` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `CrmContact` table. All the data in the column will be lost.
  - You are about to drop the column `telegram` on the `CrmContact` table. All the data in the column will be lost.
  - You are about to drop the column `twitter` on the `CrmContact` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."CrmCommunication" DROP CONSTRAINT "CrmCommunication_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."CrmCommunicationTemplate" DROP CONSTRAINT "CrmCommunicationTemplate_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."CrmContact" DROP CONSTRAINT "CrmContact_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."CrmContactInteraction" DROP CONSTRAINT "CrmContactInteraction_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CrmOrganization" DROP CONSTRAINT "CrmOrganization_createdById_fkey";

-- DropIndex
DROP INDEX "public"."CrmContact_email_idx";

-- AlterTable
ALTER TABLE "public"."CrmCommunication" DROP COLUMN "errorMessage",
DROP COLUMN "fromEmail",
DROP COLUMN "fromTelegram",
DROP COLUMN "toEmail",
DROP COLUMN "toTelegram",
ADD COLUMN     "error_code" TEXT,
ADD COLUMN     "error_message_redacted" TEXT,
ADD COLUMN     "from_email_encrypted" BYTEA,
ADD COLUMN     "from_telegram_encrypted" BYTEA,
ADD COLUMN     "to_email_encrypted" BYTEA,
ADD COLUMN     "to_telegram_encrypted" BYTEA,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."CrmCommunicationTemplate" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."CrmContact" DROP COLUMN "email",
DROP COLUMN "github",
DROP COLUMN "linkedIn",
DROP COLUMN "phone",
DROP COLUMN "telegram",
DROP COLUMN "twitter",
ADD COLUMN     "email_encrypted" BYTEA,
ADD COLUMN     "github_encrypted" BYTEA,
ADD COLUMN     "linkedIn_encrypted" BYTEA,
ADD COLUMN     "phone_encrypted" BYTEA,
ADD COLUMN     "telegram_encrypted" BYTEA,
ADD COLUMN     "twitter_encrypted" BYTEA,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."CrmContactInteraction" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."CrmOrganization" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CrmContact_email_encrypted_idx" ON "public"."CrmContact"("email_encrypted");

-- AddForeignKey
ALTER TABLE "public"."CrmContact" ADD CONSTRAINT "CrmContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmOrganization" ADD CONSTRAINT "CrmOrganization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmContactInteraction" ADD CONSTRAINT "CrmContactInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmCommunication" ADD CONSTRAINT "CrmCommunication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrmCommunicationTemplate" ADD CONSTRAINT "CrmCommunicationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
