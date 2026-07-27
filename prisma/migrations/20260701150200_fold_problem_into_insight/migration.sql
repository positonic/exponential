-- ADR-0036: fold Problem into Insight. Step 2 of 2.
-- Backfills every Problem row into Insight as type=PROBLEM (BEFORE any drop),
-- then drops the Problem model, the ProblemApproach link table, and the
-- ProblemStage enum.
--
-- Stage -> status mapping: IDEA->INBOX, QUALIFIED->TRIAGED, PRIORITISED->LINKED.
-- Field mapping: description->body, evidence->evidence, impact/confidence/
-- category/parkedAt/parkReason copied, researchId=null, description=''.
-- The Problem id is reused as the Insight id (stable, traceable).
--
-- ProblemApproach (Problem<->Project "Approach" links) is INTENTIONALLY DISCARDED,
-- not migrated — the Approach workflow never shipped (ADR-0036, confirmed with a
-- human before authoring this migration).

-- Backfill Problem -> Insight
INSERT INTO "public"."Insight" (
  "id", "productId", "researchId", "type", "title", "body", "source",
  "sentiment", "description", "status", "impact", "confidence", "category",
  "evidence", "parkedAt", "parkReason", "createdById", "createdAt", "updatedAt"
)
SELECT
  "id",
  "productId",
  NULL,
  'PROBLEM'::"public"."InsightType",
  "title",
  "description",
  NULL,
  NULL,
  '',
  (CASE "stage"
    WHEN 'IDEA' THEN 'INBOX'
    WHEN 'QUALIFIED' THEN 'TRIAGED'
    WHEN 'PRIORITISED' THEN 'LINKED'
    ELSE 'INBOX'
  END)::"public"."InsightStatus",
  "impact",
  "confidence",
  "category",
  "evidence",
  "parkedAt",
  "parkReason",
  "createdById",
  "createdAt",
  "updatedAt"
FROM "public"."Problem";

-- DropTable (ProblemApproach first — it FKs Problem)
DROP TABLE "public"."ProblemApproach";

-- DropTable
DROP TABLE "public"."Problem";

-- DropEnum
DROP TYPE "public"."ProblemStage";
