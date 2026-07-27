-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "applicantAccountPrompt" TEXT,
ADD COLUMN     "offerApplicantAccount" BOOLEAN NOT NULL DEFAULT true;
