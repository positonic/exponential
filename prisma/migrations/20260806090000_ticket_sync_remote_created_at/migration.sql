-- Explicit provenance for Notion pages the OUTBOUND push created.
--
-- Until now the only record of "we authored this page" was the run ledger's
-- `items[].action === "created"` — which the INBOUND engine also writes, with
-- the opposite meaning ("created a ticket from this page"). Reading that as
-- page provenance let the body-repair pass wipe human-authored Notion pages.
ALTER TABLE "TicketSync" ADD COLUMN "remoteCreatedAt" TIMESTAMP(3);

-- Backfill from PUSH-direction, non-dry-run runs only. This is the correct
-- derivation of the same signal: a page id recorded as `created` by an
-- outbound run is a page the push created. Inbound (`direction = 'pull'`) and
-- dry runs are deliberately excluded — those ids are human-authored pages.
UPDATE "TicketSync" ts
SET "remoteCreatedAt" = src."startedAt"
FROM (
  SELECT DISTINCT ON (r."configId", item->>'externalId')
         r."configId"           AS config_id,
         item->>'externalId'    AS external_id,
         r."startedAt"          AS "startedAt"
  FROM "TicketSyncRun" r
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r."items") = 'array' THEN r."items" ELSE '[]'::jsonb END
  ) AS item
  WHERE r."direction" = 'push'
    AND r."dryRun" = false
    AND item->>'action' = 'created'
    AND item->>'externalId' IS NOT NULL
  ORDER BY r."configId", item->>'externalId', r."startedAt" ASC
) src
WHERE ts."configId" = src.config_id
  AND ts."externalId" = src.external_id;
