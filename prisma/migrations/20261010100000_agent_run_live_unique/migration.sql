-- ADR-0067: at most one live run per (action, agent). Coalescing in the app is
-- check-then-act; this partial unique index is the constraint behind it, so two
-- concurrent assigns cannot both start a run. Terminal statuses are excluded, so
-- a resume after WAITING_ON_OWNER and a retry after FAILED stay possible.
-- (Prisma cannot express partial indexes, so this lives only in SQL.)
CREATE UNIQUE INDEX "AgentRun_live_action_agent_key"
  ON "AgentRun"("actionId", "agentId")
  WHERE "status" IN ('QUEUED', 'RUNNING');
