'use client';

import { useMemo, useState, memo, type ReactNode } from 'react';
import { Collapse, Loader, UnstyledButton } from '@mantine/core';
import { IconCheck, IconChevronDown, IconChevronRight, IconX, IconAlertTriangle } from '@tabler/icons-react';
import type { ToolCall } from '~/providers/AgentModalProvider';
import { TOOL_DISPLAY, humanizeToolName, type ToolDisplay } from './toolDisplayNames';

interface ToolActivityProps {
  calls: ToolCall[];
}

interface ToolGroup {
  toolName: string;
  display: ToolDisplay | undefined;
  calls: ToolCall[];
}

// Group consecutive same-name calls. Mixed sequences render multiple groups.
function groupCalls(calls: ToolCall[]): ToolGroup[] {
  const groups: ToolGroup[] = [];
  for (const call of calls) {
    const last = groups[groups.length - 1];
    if (last && last.toolName === call.name) {
      last.calls.push(call);
    } else {
      groups.push({
        toolName: call.name,
        display: TOOL_DISPLAY[call.name],
        calls: [call],
      });
    }
  }
  return groups;
}

function formatCount(template: string, n: number, total?: number): string {
  return template.replace('{n}', String(n)).replace('{total}', String(total ?? n));
}

function callLabel(call: ToolCall, display: ToolDisplay | undefined): string {
  const arg = display?.pickArg(call.args);
  if (arg) return arg;
  // Unmapped tool: show the first string-ish arg as a fallback
  if (call.args) {
    for (const v of Object.values(call.args)) {
      if (typeof v === 'string' && v.trim()) return v;
    }
  }
  return display ? display.verb : humanizeToolName(call.name);
}

function StatusIcon({ status }: { status: ToolCall['status'] }) {
  if (status === 'running') return <Loader size="xs" />;
  if (status === 'error') return <IconX size={14} className="text-red-500" />;
  return <IconCheck size={14} className="text-brand-primary" />;
}

const ToolGroupRow = memo(function ToolGroupRow({ group }: { group: ToolGroup }) {
  const { calls, display, toolName } = group;
  const total = calls.length;
  const completedCount = calls.filter((c) => c.status !== 'running').length;
  const errorCount = calls.filter((c) => c.status === 'error').length;
  const successCount = calls.filter((c) => c.status === 'success').length;
  const isRunning = completedCount < total;

  // Single-call shortcut: show inline, no toggle needed.
  const singleCall = total === 1 ? calls[0] : undefined;
  const [open, setOpen] = useState(false);

  let headerLabel: ReactNode;
  let headerIcon: ReactNode;

  if (singleCall) {
    headerIcon = <StatusIcon status={singleCall.status} />;
    const verb =
      singleCall.status === 'running'
        ? display?.verb ?? humanizeToolName(toolName)
        : display?.pastTense ?? humanizeToolName(toolName);
    const arg = display?.pickArg(singleCall.args) ?? callLabel(singleCall, display);
    headerLabel = (
      <span className="text-text-secondary text-xs">
        {verb}
        {arg && arg !== verb ? `: ${arg}` : ''}
        {singleCall.status === 'error' && singleCall.errorMsg ? ` — ${singleCall.errorMsg}` : ''}
      </span>
    );
  } else if (isRunning) {
    headerIcon = <Loader size="xs" />;
    const template = display?.progress ?? `${humanizeToolName(toolName)}… {n}/{total}`;
    headerLabel = (
      <span className="text-text-secondary text-xs">
        {formatCount(template, completedCount, total)}
      </span>
    );
  } else if (errorCount > 0) {
    headerIcon = <IconAlertTriangle size={14} className="text-red-500" />;
    headerLabel = (
      <span className="text-text-secondary text-xs">
        {display?.pastTense ?? humanizeToolName(toolName)} — {successCount} of {total} succeeded
      </span>
    );
  } else {
    headerIcon = <IconCheck size={14} className="text-brand-primary" />;
    const template = display?.pluralPast ?? `${humanizeToolName(toolName)} ×{n}`;
    headerLabel = (
      <span className="text-text-secondary text-xs">{formatCount(template, total)}</span>
    );
  }

  if (singleCall) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        {headerIcon}
        {headerLabel}
      </div>
    );
  }

  return (
    <div>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-surface-hover"
      >
        {headerIcon}
        {headerLabel}
        <span className="ml-auto text-text-muted">
          {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
      </UnstyledButton>
      <Collapse in={open}>
        <ul className="mt-1 space-y-0.5 pl-6">
          {calls.map((call) => (
            <li key={call.id} className="flex items-center gap-2">
              <StatusIcon status={call.status} />
              <span className="text-text-secondary text-xs">
                {callLabel(call, display)}
                {call.status === 'error' && call.errorMsg ? (
                  <span className="text-text-muted"> — {call.errorMsg}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
});

export const ToolActivity = memo(function ToolActivity({ calls }: ToolActivityProps) {
  const groups = useMemo(() => groupCalls(calls), [calls]);
  if (groups.length === 0) return null;

  return (
    <div className="mb-2 space-y-1 rounded-md border border-border-primary bg-surface-secondary px-2 py-1.5">
      {groups.map((group, idx) => (
        <ToolGroupRow key={`${group.toolName}-${idx}`} group={group} />
      ))}
    </div>
  );
});
