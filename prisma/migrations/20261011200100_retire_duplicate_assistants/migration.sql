-- ADR-0072: one Assistant per person. Three steps, then the index that makes
-- it an invariant. Data-only apart from the index; James runs it by hand
-- (`scripts/plan-assistant-retirement.ts` reports, read-only, what step 2
-- will do — run it first).

-- Step 1 — agents hold `member` and nothing else (ADR-0049 §3). Before PR #915
-- an owner could make an agent `admin` or `viewer`; correct any such row.
-- Admin/owner → member. Viewer → member where the agent's owner holds a
-- delegating role there (`DELEGATING_WORKSPACE_ROLES`: owner, admin, member —
-- the delegation invariant), else the membership is removed, as
-- `cascadeOwnerRoleChanged` would have done.
DO $$
DECLARE
  demoted INT;
  removed INT;
  promoted INT;
BEGIN
  UPDATE "WorkspaceUser" wu
  SET "role" = 'member'
  FROM "User" u
  WHERE u."id" = wu."userId" AND u."isAgent" AND wu."role" IN ('admin', 'owner');
  GET DIAGNOSTICS demoted = ROW_COUNT;

  DELETE FROM "WorkspaceUser" wu
  USING "ExternalAgent" ea
  WHERE ea."shadowUserId" = wu."userId"
    AND wu."role" = 'viewer'
    AND NOT EXISTS (
      SELECT 1 FROM "WorkspaceUser" o
      WHERE o."userId" = ea."ownerId"
        AND o."workspaceId" = wu."workspaceId"
        AND o."role" IN ('owner', 'admin', 'member')
    );
  GET DIAGNOSTICS removed = ROW_COUNT;

  UPDATE "WorkspaceUser" wu
  SET "role" = 'member'
  FROM "ExternalAgent" ea
  WHERE ea."shadowUserId" = wu."userId" AND wu."role" = 'viewer';
  GET DIAGNOSTICS promoted = ROW_COUNT;

  RAISE NOTICE 'Agent roles: % admin/owner row(s) set to member, % viewer row(s) removed, % viewer row(s) set to member',
    demoted, removed, promoted;
END $$;

-- Step 2 — each person keeps one Assistant; the rest are retired into it.
-- The survivor rule is `planAssistantRetirement`
-- (src/server/services/assistant/retirementPlan.ts), best first:
--   1. a default Assistant in the person's default workspace, still accessible
--   2. a default Assistant in any workspace the person can still access
--   3. any Assistant in a workspace the person can still access
--   4. any Assistant
-- then the most recently edited, then the id. "Access" is
-- `buildWorkspaceAccessWhere`: a direct membership or a team in the workspace.
-- Retirement is `retireAssistant` (src/server/services/assistant/retire.ts):
-- the Assistant, its External agent and its shadow user are KEPT (deleting the
-- External agent would cascade-delete its Agent runs); its keys are revoked;
-- its memberships, the Positions held through them, and its assignments on
-- open Actions move to the survivor; its live and waiting runs are cancelled.
-- Nothing here starts an Agent run.
DO $$
DECLARE
  r RECORD;
  run RECORD;
  old_agent TEXT;
  old_shadow TEXT;
  new_shadow TEXT;
  retired INT := 0;
  n INT;
  memberships_moved INT := 0;
  positions_moved INT := 0;
  assignments_moved INT := 0;
  runs_cancelled INT := 0;
BEGIN
  FOR r IN
    WITH ranked AS (
      SELECT
        a."id",
        a."createdById",
        ROW_NUMBER() OVER (
          PARTITION BY a."createdById"
          ORDER BY
            CASE
              WHEN NOT (
                EXISTS (
                  SELECT 1 FROM "WorkspaceUser" m
                  WHERE m."userId" = a."createdById" AND m."workspaceId" = a."workspaceId"
                )
                OR EXISTS (
                  SELECT 1 FROM "Team" t
                  JOIN "TeamUser" tu ON tu."teamId" = t."id"
                  WHERE t."workspaceId" = a."workspaceId" AND tu."userId" = a."createdById"
                )
              ) THEN 4
              WHEN NOT a."isDefault" THEN 3
              WHEN a."workspaceId" = u."defaultWorkspaceId" THEN 1
              ELSE 2
            END,
            a."updatedAt" DESC,
            a."id" COLLATE "C"
        ) AS rn
      FROM "Assistant" a
      JOIN "User" u ON u."id" = a."createdById"
      WHERE a."retiredAt" IS NULL
    )
    SELECT loser."id" AS retire_id, winner."id" AS survivor_id
    FROM ranked loser
    JOIN ranked winner ON winner."createdById" = loser."createdById" AND winner.rn = 1
    WHERE loser.rn > 1
  LOOP
    SELECT ea."id", ea."shadowUserId" INTO old_agent, old_shadow
    FROM "Assistant" a JOIN "ExternalAgent" ea ON ea."id" = a."externalAgentId"
    WHERE a."id" = r.retire_id;

    SELECT ea."shadowUserId" INTO new_shadow
    FROM "Assistant" a JOIN "ExternalAgent" ea ON ea."id" = a."externalAgentId"
    WHERE a."id" = r.survivor_id;

    UPDATE "Assistant" SET "retiredAt" = now(), "isDefault" = false WHERE "id" = r.retire_id;

    DELETE FROM "ExternalAgentKey" WHERE "agentId" = old_agent;

    -- Memberships, then the Positions held through them, then drop the old ones
    -- (a PositionHolder row cascades with its membership).
    INSERT INTO "WorkspaceUser" ("id", "userId", "workspaceId", "role")
    SELECT replace(gen_random_uuid()::text, '-', ''), new_shadow, wu."workspaceId", 'member'
    FROM "WorkspaceUser" wu
    WHERE wu."userId" = old_shadow
    ON CONFLICT ("userId", "workspaceId") DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    memberships_moved := memberships_moved + n;

    INSERT INTO "PositionHolder" ("positionId", "workspaceUserId")
    SELECT ph."positionId", nwu."id"
    FROM "PositionHolder" ph
    JOIN "WorkspaceUser" owu ON owu."id" = ph."workspaceUserId" AND owu."userId" = old_shadow
    JOIN "WorkspaceUser" nwu ON nwu."workspaceId" = owu."workspaceId" AND nwu."userId" = new_shadow
    ON CONFLICT ("positionId", "workspaceUserId") DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    positions_moved := positions_moved + n;

    DELETE FROM "WorkspaceUser" WHERE "userId" = old_shadow;

    -- Assignments on open Actions; those on completed or cancelled ones stay.
    INSERT INTO "ActionAssignee" ("id", "actionId", "userId")
    SELECT replace(gen_random_uuid()::text, '-', ''), aa."actionId", new_shadow
    FROM "ActionAssignee" aa
    JOIN "Action" ac ON ac."id" = aa."actionId"
    WHERE aa."userId" = old_shadow AND ac."status" NOT IN ('COMPLETED', 'CANCELLED')
    ON CONFLICT ("actionId", "userId") DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    assignments_moved := assignments_moved + n;

    DELETE FROM "ActionAssignee" aa
    USING "Action" ac
    WHERE ac."id" = aa."actionId"
      AND aa."userId" = old_shadow
      AND ac."status" NOT IN ('COMPLETED', 'CANCELLED');

    FOR run IN
      SELECT "id", "status" FROM "AgentRun"
      WHERE "agentId" = old_agent AND "status" IN ('QUEUED', 'RUNNING', 'WAITING_ON_OWNER')
    LOOP
      -- Guarded on the status read, as `retireAssistant` is: a run that
      -- finished meanwhile (the app is live during the migration) keeps its
      -- result, and gets no event.
      UPDATE "AgentRun"
      SET "status" = 'CANCELLED', "finishedAt" = now(), "lastEventAt" = now()
      WHERE "id" = run."id" AND "status" = run."status";
      GET DIAGNOSTICS n = ROW_COUNT;

      IF n = 1 THEN
        INSERT INTO "AgentRunEvent" ("id", "runId", "seq", "kind", "payload")
        VALUES (
          replace(gen_random_uuid()::text, '-', ''),
          run."id",
          COALESCE((SELECT max(e."seq") FROM "AgentRunEvent" e WHERE e."runId" = run."id"), 0) + 1,
          'status',
          jsonb_build_object('status', 'CANCELLED', 'by', 'assistant-retired', 'was', run."status"::text)
        );
        runs_cancelled := runs_cancelled + 1;
      END IF;
    END LOOP;

    retired := retired + 1;
    RAISE NOTICE 'Retired Assistant % into %', r.retire_id, r.survivor_id;
  END LOOP;

  RAISE NOTICE 'Assistant retirement done: % retired; % membership(s), % Position holding(s), % open assignment(s) moved; % run(s) cancelled',
    retired, memberships_moved, positions_moved, assignments_moved, runs_cancelled;
END $$;

-- Step 3 — a person's only Assistant is their default. The per-workspace
-- readers that still key on `isDefault` go in V1b; until then a survivor that
-- was not a default must still resolve.
UPDATE "Assistant" SET "isDefault" = true WHERE "retiredAt" IS NULL AND NOT "isDefault";

-- One Assistant per person: at most one non-retired row per user. Prisma
-- cannot express a partial index, so this lives only in SQL (like
-- "AgentRun_live_action_agent_key"). `ensureAssistantForUser` resolves a
-- concurrent first-need race on it (P2002) to the winner's row.
CREATE UNIQUE INDEX "Assistant_active_per_user_key"
  ON "Assistant"("createdById") WHERE "retiredAt" IS NULL;
