-- Data migration (ADR-0045): move the legacy per-user opt-in channel choice
-- (NotificationPreference.integrationId + the category booleans) into the new
-- category × channel matrix (NotificationChannelPreference).
--
-- Rule (per the PRD): for each user whose NotificationPreference points at an
-- opt-in channel integration (Matrix / WhatsApp / Zulip), enable that channel
-- for the categories whose legacy boolean was true:
--   taskReminders  -> due_date
--   dailySummary   -> summary
--   weeklySummary  -> summary
-- (projectUpdates has no v1 category and is intentionally dropped.)
--
-- Always-on channels (Push, Email) keep the seeded defaults and are not written
-- here. Idempotent: re-running only re-affirms enabled cells.

INSERT INTO "NotificationChannelPreference" ("id", "userId", "category", "channel", "enabled", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  np."userId",
  m.category,
  i."provider",
  true,
  now(),
  now()
FROM "NotificationPreference" np
JOIN "Integration" i
  ON i."id" = np."integrationId"
  AND i."provider" IN ('matrix', 'whatsapp', 'zulip')
JOIN LATERAL (
  VALUES
    ('due_date', np."taskReminders"),
    ('summary', np."dailySummary"),
    ('summary', np."weeklySummary")
) AS m(category, flag) ON m.flag = true
WHERE np."integrationId" IS NOT NULL
ON CONFLICT ("userId", "category", "channel")
DO UPDATE SET "enabled" = true, "updatedAt" = now();
