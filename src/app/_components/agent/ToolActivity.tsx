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

// Only a curated pickArg may surface an arg value. An unmapped tool shows its
// humanized verb alone — never a guessed arg (no ids, booleans, or JSON).
function callLabel(call: ToolCall, display: ToolDisplay | undefined): string {
  const arg = display?.pickArg(call.args);
  if (arg) return arg;
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
    if (singleCall.status === 'error') {
      // Calm failure line: verb only, no arg, no raw error. The raw error
      // text lives behind the row's click-to-expand (rendered below).
      headerLabel = (
        <span className="text-text-secondary text-xs">
          {display?.verb ?? humanizeToolName(toolName)} — failed
        </span>
      );
    } else {
      const verb =
        singleCall.status === 'running'
          ? display?.verb ?? humanizeToolName(toolName)
          : display?.pastTense ?? humanizeToolName(toolName);
      const arg = display?.pickArg(singleCall.args);
      headerLabel = (
        <span className="text-text-secondary text-xs">
          {verb}
          {arg && arg !== verb ? `: ${arg}` : ''}
        </span>
      );
    }
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
    if (singleCall.status === 'error') {
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
            <div className="mt-1 break-words pl-6 pr-2 pb-1 text-xs text-text-muted">
              {singleCall.errorMsg?.trim() ? singleCall.errorMsg.trim() : 'No error details available.'}
            </div>
          </Collapse>
        </div>
      );
    }
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
