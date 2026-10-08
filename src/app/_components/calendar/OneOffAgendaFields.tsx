"use client";

import { useMemo } from "react";
import { Checkbox, Chip, Group, Input, Stack, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import {
  ONE_OFF_PRESETS,
  ONE_OFF_SECTION_TYPES,
  type OneOffSectionType,
} from "~/server/services/ceremonies/oneOffPresets";

/**
 * The agenda half of booking a meeting with a project (ADR-0059 amendment,
 * 2026-10-07): a purpose, a preset that ticks a set of sections, and the
 * checklist itself — each section showing what it would hold right now, from
 * a dry run of the real section queries. The purpose always heads the
 * free-text section, so that section is not a checkbox.
 */
const TOGGLEABLE: OneOffSectionType[] = ONE_OFF_SECTION_TYPES.filter((t) => t !== "free_text");

export function presetSectionTypes(presetKey: string): OneOffSectionType[] {
  return ONE_OFF_PRESETS.find((p) => p.key === presetKey)?.sections.map((s) => s.type) ?? ["free_text"];
}

export function OneOffAgendaFields({
  workspaceId,
  projectId,
  scheduledStart,
  durationMinutes,
  purpose,
  onPurposeChange,
  presetKey,
  onPresetChange,
  sectionTypes,
  onSectionTypesChange,
}: {
  workspaceId: string;
  projectId: string;
  scheduledStart: Date;
  durationMinutes: number;
  purpose: string;
  onPurposeChange: (value: string) => void;
  presetKey: string;
  onPresetChange: (key: string) => void;
  sectionTypes: OneOffSectionType[];
  onSectionTypesChange: (types: OneOffSectionType[]) => void;
}) {
  // Every section is previewed, ticked or not, so ticking one shows its
  // count at once. The purpose isn't sent: it only fills the free-text
  // section, which the form already shows.
  const preview = api.ceremony.previewOneOffAgenda.useQuery(
    {
      workspaceId,
      projectId,
      scheduledStart,
      durationMinutes,
      sectionTypes: [...ONE_OFF_SECTION_TYPES],
      purposePreset: presetKey,
    },
    { placeholderData: (previous) => previous, staleTime: 60_000, retry: false },
  );
  const rowByType = useMemo(
    () => new Map((preview.data ?? []).map((row) => [row.type, row])),
    [preview.data],
  );

  const toggle = (type: OneOffSectionType, checked: boolean) => {
    const rest = sectionTypes.filter((t) => t !== type);
    if (!checked) {
      onSectionTypesChange(rest);
      return;
    }
    // New sections go before the discussion, which closes the meeting.
    const discussionAt = rest.indexOf("free_text");
    const at = discussionAt === -1 ? rest.length : discussionAt;
    onSectionTypesChange([...rest.slice(0, at), type, ...rest.slice(at)]);
  };

  return (
    <Stack gap="sm">
      <Input.Wrapper
        label="Purpose"
        description="What should this meeting decide or produce? It heads the agenda and the invite."
      >
        <div className="mt-1">
          <MarkdownInput
            value={purpose}
            // The server caps a purpose at 2000 characters.
            onChange={(value) => onPurposeChange(value.slice(0, 2000))}
            placeholder="e.g. Agree the launch scope and who owns each part"
            minRows={2}
            maxRows={6}
          />
        </div>
      </Input.Wrapper>

      <div>
        <Text size="sm" fw={500} mb={6}>
          Kind of meeting
        </Text>
        <Chip.Group
          multiple={false}
          value={presetKey}
          onChange={(key) => {
            onPresetChange(key);
            onSectionTypesChange(presetSectionTypes(key));
          }}
        >
          <Group gap={6}>
            {ONE_OFF_PRESETS.map((preset) => (
              <Chip key={preset.key} value={preset.key} size="xs" variant="outline">
                {preset.label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </div>

      <div>
        <Text size="sm" fw={500}>
          Agenda
        </Text>
        <Text size="xs" c="dimmed" mb={6}>
          Generated from the project now, and refreshed before the meeting.
        </Text>
        <Stack gap={8}>
          {TOGGLEABLE.map((type) => {
            const row = rowByType.get(type);
            const checked = sectionTypes.includes(type);
            return (
              <Checkbox
                key={type}
                checked={checked}
                onChange={(e) => toggle(type, e.currentTarget.checked)}
                label={row?.title ?? type}
                description={
                  preview.isLoading
                    ? "Looking…"
                    : preview.error
                      ? "Couldn't preview this section"
                      : !row || row.count === 0
                        ? "Nothing to raise right now"
                        : `${row.count} item${row.count === 1 ? "" : "s"} · ${row.sample.join(" · ")}`
                }
                styles={{ description: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }}
              />
            );
          })}
          <Text size="xs" c="dimmed">
            {rowByType.get("free_text")?.title ?? "Discussion"}: your purpose, then anything added by hand.
          </Text>
        </Stack>
      </div>
    </Stack>
  );
}
