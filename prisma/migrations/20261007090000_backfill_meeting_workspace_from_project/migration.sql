-- A project-linked Meeting inherits its Project's Workspace (CONTEXT.md,
-- ADR-0014). The device recorder's create path stored meetings with a project
-- and no workspace, and a project moved between workspaces left its meetings
-- behind. Bring those rows in line, along with what travels with a meeting's
-- workspace: the actions still in its project, its participants (whose CRM
-- contact belongs to the old workspace, so that link is cleared) and a
-- ceremony link to another workspace's occurrence. Personal projects (no
-- workspace) are left as they are.

UPDATE "TranscriptionSession" s
SET "workspaceId" = p."workspaceId"
FROM "Project" p
WHERE s."projectId" = p."id"
  AND p."workspaceId" IS NOT NULL
  AND s."workspaceId" IS DISTINCT FROM p."workspaceId";

-- "Action"."transcriptionSessionId" is added by the migration directory
-- `add_transcription_action_relationship_20250723110953`, which has no
-- timestamp prefix and so applies AFTER every timestamped migration on a fresh
-- database (CI, tests). On such a database the tables are empty and there is
-- nothing to backfill; on an existing database the column is present and the
-- backfill runs. Only actions still in the meeting's project follow it; one
-- moved to another project keeps that project's placement.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Action' AND column_name = 'transcriptionSessionId'
  ) THEN
    UPDATE "Action" a
    SET "workspaceId" = s."workspaceId"
    FROM "TranscriptionSession" s
    WHERE a."transcriptionSessionId" = s."id"
      AND a."projectId" = s."projectId"
      AND s."workspaceId" IS NOT NULL
      AND a."workspaceId" IS DISTINCT FROM s."workspaceId";
  END IF;
END $$;

UPDATE "TranscriptionSessionParticipant" tp
SET "workspaceId" = s."workspaceId", "contactId" = NULL
FROM "TranscriptionSession" s
WHERE tp."transcriptionSessionId" = s."id"
  AND s."workspaceId" IS NOT NULL
  AND tp."workspaceId" <> s."workspaceId";

UPDATE "TranscriptionSession" s
SET "occurrenceId" = NULL
FROM "CeremonyOccurrence" o
WHERE s."occurrenceId" = o."id"
  AND (s."workspaceId" IS NULL OR o."workspaceId" <> s."workspaceId");
