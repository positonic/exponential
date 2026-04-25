-- AlterTable
ALTER TABLE "public"."NavigationPreference" ADD COLUMN     "showInspiringQuote" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSuggestedFocus" BOOLEAN NOT NULL DEFAULT true;
