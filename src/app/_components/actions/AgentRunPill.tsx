"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Group, Loader, Text, Tooltip } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { AgentRunTranscript } from "./AgentRunTranscript";

const LIVE = new Set(["QUEUED", "RUNNING"]);
/** ~30 s of catch-up polling before a never-arriving run is given up on. */
const MAX_CATCH_UP_POLLS = 15;

type Run = RouterOutputs["agentRun"]["listForAction"][number];

export function hasLiveRun(runs: Run[] | undefined): boolean {
  return !!runs?.some((r) => LIVE.has(r.status));
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function verbFor(run: Run): "Working" | "Worked for" | "Stopped" | "Waiting on owner" | "Queued" {
  switch (run.status) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Working";
    case "SUCCEEDED":
      return "Worked for";
    case "WAITING_ON_OWNER":
      return "Waiting on owner";
    default:
      return "Stopped";
  }
}

/**
 * "Aria · Working 1m · called 3 tools" above the Activity section while a run
 * is live; "Worked for 2m · called 12 tools" after; "Stopped" on failure,
 * cancel or timeout (ADR-0067, Agent PRD D11). Polls every 2 s only while a
 * run is live, and invalidates the action when the run leaves the live set
 * so the title spinner and any comments the run posted refresh together.
 */
export function AgentRunPill({
  actionId,
  activeRunId,
}: {
  actionId: string;
  /** The action query's live run, if any — starts polling before this query has seen it. */
  activeRunId?: string | null;
}) {
  const utils = api.useUtils();
  const cancel = api.agentRun.cancel.useMutation({
    onSuccess: () => {
      void utils.agentRun.listForAction.invalidate({ actionId });
      void utils.action.getById.invalidate({ id: actionId });
    },
  });
  // Catch-up polling: the action query may know about a live run this query
  // has not fetched yet. Poll for it a bounded number of times, then give up —
  // a stale activeRunId must never keep the page polling forever.
  const catchUpAttempts = useRef(0);
  const { data: runs } = api.agentRun.listForAction.useQuery(
    { actionId },
    {
      refetchInterval: (query) => {
        if (hasLiveRun(query.state.data)) return 2000;
        const seen = !activeRunId || !!query.state.data?.some((r) => r.id === activeRunId);
        if (seen) {
          catchUpAttempts.current = 0;
          return false;
        }
        return catchUpAttempts.current++ < MAX_CATCH_UP_POLLS ? 2000 : false;
      },
    },
  );
  const latest = runs?.[0];
  const live = latest ? LIVE.has(latest.status) : false;

  // 1 s tick for the elapsed time while live.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [live]);

  // Live → not live: the run may have commented or changed fields.
  const [wasLive, setWasLive] = useState(false);
  useEffect(() => {
    if (live && !wasLive) setWasLive(true);
    if (!live && wasLive) {
      setWasLive(false);
      void utils.action.getById.invalidate({ id: actionId });
    }
  }, [live, wasLive, actionId, utils]);

  if (!latest) return null;

  const start = latest.startedAt ?? latest.createdAt;
  const end = latest.finishedAt ?? (live ? new Date() : latest.lastEventAt ?? latest.createdAt);
  const elapsed = formatDuration(new Date(end).getTime() - new Date(start).getTime());
  const verb = verbFor(latest);
  const name = latest.agent.assistant?.emoji
    ? `${latest.agent.assistant.emoji} ${latest.agent.name}`
    : latest.agent.name;
  const tools = `called ${latest.toolCallCount} tool${latest.toolCallCount === 1 ? "" : "s"}`;

  const copy =
    verb === "Queued"
      ? `${name} · Queued`
      : verb === "Waiting on owner"
        ? `${name} · Waiting on owner · ${tools}`
        : verb === "Stopped"
          ? `${name} · Stopped after ${elapsed} · ${tools}`
          : `${name} · ${verb} ${elapsed} · ${tools}`;

  return (
    <div>
    <Tooltip label={latest.error ?? latest.summary ?? copy} multiline maw={360} disabled={!latest.error && !latest.summary}>
      <Group
        gap="xs"
        px="sm"
        py={6}
        mb="md"
        className="inline-flex rounded-full border border-border-primary bg-surface-secondary"
        data-testid="agent-run-pill"
        data-status={latest.status}
      >
        {live ? <Loader size={14} /> : <IconRobot size={14} className="text-text-muted" />}
        <Text size="sm" className="text-text-primary">
          {copy}
        </Text>
        {live && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            loading={cancel.isPending}
            onClick={() => cancel.mutate({ runId: latest.id })}
            data-testid="agent-run-cancel"
          >
            Cancel
          </Button>
        )}
      </Group>
    </Tooltip>
    <AgentRunTranscript run={latest} live={live} />
    </div>
  );
}
