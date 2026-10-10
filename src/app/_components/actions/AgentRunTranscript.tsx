"use client";

import { useState } from "react";
import { Collapse, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";

type Run = RouterOutputs["agentRun"]["listForAction"][number];
type RunEvent = NonNullable<Run["events"]>[number];

/** Tool id → human verb, in the two tenses the transcript needs. */
const TOOL_LABELS: Record<string, { running: string; completed: string }> = {
  "get-run-context": { running: "Reading the action", completed: "Read the action" },
  "comment-on-action": { running: "Commenting", completed: "Commented on the action" },
  "reassign-action": { running: "Reassigning", completed: "Added an assignee" },
  "ask-owner": { running: "Asking you", completed: "Asked you a question" },
  "finish-run": { running: "Wrapping up", completed: "Finished" },
};

function humanize(tool: string): string {
  return tool.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function labelForEvent(event: RunEvent, isLast: boolean, live: boolean): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.kind) {
    case "tool_call": {
      const tool = typeof payload.tool === "string" ? payload.tool : "tool";
      const label = TOOL_LABELS[tool];
      const tense = isLast && live ? "running" : "completed";
      const base = label ? label[tense] : humanize(tool);
      if (tool === "reassign-action" && typeof payload.name === "string") return `${base}: ${payload.name}`;
      if (tool === "comment-on-action" && typeof payload.snippet === "string") return `${base}: "${payload.snippet.slice(0, 80)}"`;
      return base;
    }
    case "text":
      return typeof payload.text === "string" ? payload.text : "Progress";
    case "status":
      return typeof payload.status === "string" ? `Status: ${payload.status}` : "Status changed";
    case "error":
      return typeof payload.message === "string" ? `Error: ${payload.message}` : "Error";
    default:
      return typeof payload.text === "string" ? payload.text : humanize(event.kind);
  }
}

/**
 * The owner-only tool-by-tool transcript under the pill (ADR-0067, Agent PRD
 * D11): collapsible, newest last. Everyone else sees only the pill; the
 * server never sends them events.
 */
export function AgentRunTranscript({ run, live }: { run: Run; live: boolean }) {
  const [open, setOpen] = useState(false);
  const events = run.events ?? [];
  if (!run.isOwner || events.length === 0) return null;

  return (
    <div className="mb-md" data-testid="agent-run-transcript">
      <UnstyledButton onClick={() => setOpen((o) => !o)} className="text-text-secondary">
        <Group gap={4}>
          {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text size="xs">
            {open ? "Hide" : "Show"} transcript ({events.length} step{events.length === 1 ? "" : "s"})
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <Stack gap={2} mt="xs" pl="sm" className="border-l border-border-primary">
          {events.map((event, i) => (
            <Text key={event.id} size="xs" className={event.kind === "error" ? "text-text-primary" : "text-text-secondary"}>
              {labelForEvent(event, i === events.length - 1, live)}
            </Text>
          ))}
        </Stack>
      </Collapse>
    </div>
  );
}
