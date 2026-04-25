-- AddForeignKey
ALTER TABLE "public"."WheelOfLifeRecommendation" ADD CONSTRAINT "WheelOfLifeRecommendation_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
