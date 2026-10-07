-- A project-linked Meeting inherits its Project's Workspace (CONTEXT.md,
-- ADR-0014). The device recorder's create path stored meetings with a project
-- and no workspace, and a project moved between workspaces left its meetings
-- behind. Bring those rows, and the Actions extracted from them, in line.
-- Personal projects (no workspace) are left as they are.

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
-- backfill runs.
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
      AND s."workspaceId" IS NOT NULL
      AND a."workspaceId" IS DISTINCT FROM s."workspaceId";
  END IF;
END $$;
