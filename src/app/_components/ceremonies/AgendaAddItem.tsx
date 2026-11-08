"use client";

import { useState } from "react";
import { Button, Group, SegmentedControl, Select, Stack, TextInput } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconPlus } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { PersonPicker } from "~/app/_components/shared/PersonPicker";

/** What a section's add box hands back (V9): a record to create or link, or a note. */
export type AgendaAddInput =
  | { kind: "note"; title: string }
  | { kind: "action"; title: string; assigneeId: string | null; dueDate: Date | null }
  | { kind: "decision"; decisionId: string };

type Mode = AgendaAddInput["kind"];

interface AgendaAddItemProps {
  sectionKey: string;
  workspaceId: string;
  onAdd: (sectionKey: string, input: AgendaAddInput) => void;
}

/**
 * One section's add box (ADR-0059, V9): Note (prose, Markdown), Action (a
 * real Action with an owner and a due date, chased like any other), or
 * Decision (links an existing Decision by D-number or statement; the Log
 * stays the only place a Decision is created).
 */
export function AgendaAddItem({ sectionKey, workspaceId, onAdd }: AgendaAddItemProps) {
  const [mode, setMode] = useState<Mode>("note");
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);

  // Loaded only while the Decision picker is showing.
  const { data: decisions } = api.decision.list.useQuery({ workspaceId, limit: 200 }, { enabled: mode === "decision" });
  const decisionOptions = (decisions ?? []).map((d) => ({ value: d.id, label: `${d.label} — ${d.statement}` }));

  const reset = () => {
    setTitle("");
    setAssigneeId(null);
    setDueDate(null);
    setDecisionId(null);
  };
  const canAdd = mode === "decision" ? Boolean(decisionId) : Boolean(title.trim());
  const submit = () => {
    if (!canAdd) return;
    if (mode === "note") onAdd(sectionKey, { kind: "note", title: title.trim() });
    else if (mode === "action") onAdd(sectionKey, { kind: "action", title: title.trim(), assigneeId, dueDate });
    else if (decisionId) onAdd(sectionKey, { kind: "decision", decisionId });
    reset();
  };

  return (
    <Stack gap={6} mt={8} data-testid={`agenda-add-box-${sectionKey}`}>
      <SegmentedControl
        size="xs"
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        data={[
          { value: "note", label: "+ Note" },
          { value: "action", label: "+ Action" },
          { value: "decision", label: "+ Decision" },
        ]}
        className="self-start"
        data-testid={`agenda-add-mode-${sectionKey}`}
      />
      <Group gap="xs" wrap="wrap" align="center">
        {mode === "decision" ? (
          <Select
            size="xs"
            placeholder="Find a decision by D-number or statement"
            data={decisionOptions}
            value={decisionId}
            onChange={setDecisionId}
            searchable
            nothingFoundMessage="No match"
            className="min-w-0 flex-1"
            data-testid={`agenda-add-decision-${sectionKey}`}
          />
        ) : (
          <TextInput
            size="xs"
            placeholder={mode === "action" ? "What needs doing?" : "Add a note (Markdown links work)"}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="min-w-0 flex-1"
            data-testid={`agenda-add-title-${sectionKey}`}
          />
        )}
        {mode === "action" && (
          <>
            <PersonPicker
              workspaceId={workspaceId}
              value={assigneeId}
              onChange={(id) => setAssigneeId(id)}
              noneLabel="Owner"
              clearable
            />
            <DateInput
              size="xs"
              placeholder="Due"
              value={dueDate}
              onChange={(v) => setDueDate(v ? new Date(v) : null)}
              valueFormat="D MMM"
              clearable
              className="w-28"
              data-testid={`agenda-add-due-${sectionKey}`}
            />
          </>
        )}
        <Button size="xs" variant="subtle" leftSection={<IconPlus size={12} />} disabled={!canAdd} onClick={submit} data-testid={`agenda-add-submit-${sectionKey}`}>
          Add
        </Button>
      </Group>
    </Stack>
  );
}
